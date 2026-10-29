import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';

const schema = JSON.parse(readFileSync(new URL('./cognitive-contracts.schema.json', import.meta.url), 'utf8'));
const fail = code => { throw Object.assign(new Error(code), { code }); };
export const LIMITS = Object.freeze({ valueBytes: 16384, resultBytes: 8192, stateBytes: 131072, operations: 1000, experiences: 1000, skills: 128, trials: 128 });

/** MNX canonical JSON v1: sorted UTF-16 object keys, JSON scalar encoding, dense arrays. */
export function canonicalJson(value, depth = 0) {
  if (depth > 32) fail('json_depth_exceeded');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) fail('non_json_array');
    const items = [];
    for (let i = 0; i < value.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('non_json_array');
      items.push(canonicalJson(descriptor.value, depth + 1));
    }
    return `[${items.join(',')}]`;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const keys = Object.keys(value).sort();
    if (Reflect.ownKeys(value).length !== keys.length || keys.some(k => ['__proto__', 'constructor', 'prototype'].includes(k))) fail('unsafe_json_key');
    if (keys.some(k => !Object.hasOwn(Object.getOwnPropertyDescriptor(value, k), 'value'))) fail('non_json_value');
    return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalJson(value[k], depth + 1)}`).join(',')}}`;
  }
  fail('non_json_value');
}
export const contentDigest = value => createHash('sha256').update(canonicalJson(value)).digest('hex');
/** @param {unknown} value @param {number} [limit] */
export function boundedJson(value, limit = LIMITS.valueBytes) {
  if (Buffer.byteLength(canonicalJson(value)) > limit) fail('cognitive_capacity_reached');
  return value;
}
function matches(rule, value) {
  if (rule.$ref) return matches(schema.$defs[rule.$ref.split('/').at(-1)], value);
  if (rule.anyOf) return rule.anyOf.some(r => matches(r, value));
  if (Object.hasOwn(rule, 'const') && value !== rule.const) return false;
  if (rule.enum && !rule.enum.includes(value)) return false;
  if (rule.type === 'null') return value === null;
  if (rule.type === 'boolean' && typeof value !== 'boolean') return false;
  if (rule.type === 'string') return typeof value === 'string' && value.length >= (rule.minLength ?? 0) && value.length <= (rule.maxLength ?? Infinity) && (!rule.pattern || new RegExp(rule.pattern).test(value));
  if (rule.type === 'array') return Array.isArray(value) && value.length <= (rule.maxItems ?? Infinity) && value.every(v => matches(rule.items, v));
  if (rule.type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (rule.required ?? []).every(k => Object.hasOwn(value, k)) && Object.keys(value).every(k => rule.properties?.[k] ? matches(rule.properties[k], value[k]) : rule.additionalProperties !== false);
  return true;
}
export function validateContract(name, value) {
  if (!Object.hasOwn(schema.$defs, name)) fail('unknown_cognitive_contract');
  boundedJson(value, name === 'state' ? LIMITS.stateBytes : LIMITS.valueBytes);
  if (!matches(schema.$defs[name], value)) fail(`invalid_${name}_contract`);
  return value;
}
export function parseContract(name, json) { return validateContract(name, JSON.parse(json)); }
export function canonicalTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
export function evaluationSigningBytes(receipt) {
  const { signature: _signature, ...body } = receipt;
  return new Uint8Array(Buffer.from(`MNX-EVALUATION-v1\n${canonicalJson(body)}`));
}
export function validateEvaluationPolicy(policy) {
  if (!policy || Object.keys(policy).join() !== 'trustedEvaluators' || !policy.trustedEvaluators ||
      Object.keys(policy.trustedEvaluators).length > 32) fail('invalid_evaluation_policy');
  boundedJson(policy, 65536);
  for (const [id, entry] of Object.entries(policy.trustedEvaluators)) {
    if (!id.trim() || id.length > 256 || !entry || Object.keys(entry).sort().join() !== 'publicKey,splitAuthorityId,splits' ||
        typeof entry.splitAuthorityId !== 'string' || !entry.splitAuthorityId.trim() || entry.splitAuthorityId.length > 256 ||
        !Array.isArray(entry.splits) || entry.splits.length === 0 || entry.splits.length > 2 || entry.splits.some(s => !['practice', 'held_out'].includes(s)) ||
        typeof entry.publicKey !== 'string' || !entry.publicKey.startsWith('-----BEGIN PUBLIC KEY-----') || createPublicKey(entry.publicKey).asymmetricKeyType !== 'ed25519') fail('invalid_evaluation_policy');
  }
  return structuredClone(policy);
}
/** Host trust roots plus exact execution artifacts are mandatory. Candidate text grants no authority. */
export function verifyEvaluationReceipt(receipt, expected, policy, now = Date.now()) {
  try {
    validateContract('evaluationReceipt', receipt);
    validateEvaluationPolicy(policy);
    if (!Number.isFinite(now) || !canonicalTimestamp(receipt.observedAt) || Date.parse(receipt.observedAt) > now ||
        !expected || !['skillDigest', 'taskDigest', 'environmentRevision', 'bindingDigest', 'operationId'].every(k => receipt[k] === expected[k])) return false;
    const entry = policy?.trustedEvaluators?.[receipt.evaluatorId];
    if (!entry || receipt.splitAuthorityId !== entry.splitAuthorityId || !entry.splits.includes(receipt.split)) return false;
    const key = createPublicKey(entry.publicKey);
    return key.asymmetricKeyType === 'ed25519' && verify(null, evaluationSigningBytes(receipt), key, Buffer.from(receipt.signature, 'base64'));
  } catch { return false; }
}
