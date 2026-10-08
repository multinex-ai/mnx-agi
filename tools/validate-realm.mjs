import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const schema = JSON.parse(fs.readFileSync(new URL('../schemas/realm.schema.json', import.meta.url), 'utf8'));

// Native JSON parsing establishes syntax validity. This separate token walk
// detects duplicate keys, including escaped equivalents, before using the data.
export function parseStrictJSON(text) {
  if (typeof text !== 'string' || text.length > 16 * 1024 * 1024) throw new Error('JSON input exceeds supported size');
  const value = JSON.parse(text);
  const tokens = text.match(/"(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\]:,]/g);
  let index = 0;
  function visit(depth = 0) {
    if (depth > 128) throw new Error('JSON input exceeds supported nesting');
    const token = tokens[index++];
    if (token === '{') {
      const names = new Set();
      if (tokens[index] !== '}') {
        while (true) {
          const key = JSON.parse(tokens[index++]);
          if (names.has(key)) throw new Error('Duplicate JSON key');
          names.add(key);
          index++; // colon
          visit(depth + 1);
          if (tokens[index] !== ',') break;
          index++;
        }
      }
      index++; // closing brace
    } else if (token === '[') {
      if (tokens[index] !== ']') {
        while (true) {
          visit(depth + 1);
          if (tokens[index] !== ',') break;
          index++;
        }
      }
      index++;
    }
  }
  visit();
  return value;
}

// This is deliberately a validator for the bundled schema's finite vocabulary,
// not a general JSON Schema engine. Unsupported schema keywords fail explicitly.
const keywords = new Set(['$schema', 'title', 'description', 'type', 'const', 'enum',
  'properties', 'required', 'additionalProperties', 'items', 'minItems', 'maxItems',
  'uniqueItems', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum']);
function checkSchema(node) {
  for (const key of Object.keys(node)) {
    if (!keywords.has(key)) throw new Error(`Unsupported bundled schema keyword: ${key}`);
  }
  for (const child of Object.values(node.properties ?? {})) checkSchema(child);
  if (node.items) checkSchema(node.items);
}
checkSchema(schema);

function structural(value, node, location, errors) {
  const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  const matches = node.type === 'integer' ? Number.isInteger(value) : type === node.type;
  if (node.type && !matches) {
    errors.push(`${location}: expected ${node.type}`);
    return;
  }
  if (Object.hasOwn(node, 'const') && value !== node.const) errors.push(`${location}: unsupported value`);
  if (node.enum && !node.enum.includes(value)) errors.push(`${location}: unsupported value`);
  if (type === 'object') {
    for (const key of node.required ?? []) {
      if (!Object.hasOwn(value, key)) errors.push(`${location}: required field ${key} missing`);
    }
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(node.properties ?? {}, key)) {
        if (node.additionalProperties === false) errors.push(`${location}: unknown field`);
      } else structural(value[key], node.properties[key], `${location}.${key}`, errors);
    }
  } else if (type === 'array') {
    if (value.length < (node.minItems ?? 0) || value.length > (node.maxItems ?? Infinity)) errors.push(`${location}: invalid item count`);
    if (node.uniqueItems && new Set(value.map(v => JSON.stringify(v))).size !== value.length) errors.push(`${location}: duplicate item`);
    value.forEach((item, i) => structural(item, node.items, `${location}[${i}]`, errors));
  } else if (type === 'string') {
    const length = [...value].length;
    if (length < (node.minLength ?? 0) || length > (node.maxLength ?? Infinity)) errors.push(`${location}: invalid length`);
    if (node.pattern && (!new RegExp(node.pattern).test(value) || /[\r\n]/.test(value))) errors.push(`${location}: invalid format`);
  } else if (type === 'number') {
    if (!Number.isFinite(value) || value < (node.minimum ?? -Infinity) || value > (node.maximum ?? Infinity)) errors.push(`${location}: outside permitted range`);
  }
}

export function validateRealm(value) {
  const errors = [];
  structural(value, schema, 'realm', errors);
  if (errors.length) return { ok: false, errors, runtimeVerified: false };
  const { metadata, spec } = value;
  if (metadata.parentId === metadata.id) errors.push('metadata.parentId: realm cannot parent itself');
  if (spec.policyPath.split('/').some(p => p === '.' || p === '..')) errors.push('spec.policyPath: traversal is not allowed');
  if (spec.memory.mode === 'local') {
    if (spec.memory.adapter !== 'local' || spec.memory.expectedNamespace || spec.memory.identityRef) errors.push('spec.memory: local mode must use local adapter without a remote namespace');
    if (spec.memory.onUnavailable !== 'local-only') errors.push('spec.memory: local mode uses local-only fallback');
  } else {
    if (spec.memory.adapter === 'local' || !spec.memory.expectedNamespace || !spec.memory.identityRef) errors.push('spec.memory: remote mode requires a remote adapter, expected namespace and private identity reference');
    if (spec.memory.expectedNamespace === '_commons') errors.push('spec.memory: shared commons is not a private realm binding');
  }
  if (spec.memory.mode === 'required' && spec.memory.onUnavailable !== 'pause-dependent') errors.push('spec.memory: required mode must pause dependent work');
  if (spec.coordination.coordinator === 'single-writer' && spec.coordination.maxWorkers !== 1) errors.push('spec.coordination: concurrent workers require an external verified coordinator');
  if (spec.federation.mode === 'isolated' && spec.federation.peers.length) errors.push('spec.federation: isolated realm cannot declare enabled peers');
  if (spec.federation.mode === 'explicit-grants' && !spec.federation.peers.length) errors.push('spec.federation: explicit-grants mode requires a declared peer');
  const peers = new Set();
  for (const peer of spec.federation.peers) {
    if (peer.realmId === metadata.id || peers.has(peer.realmId)) errors.push('spec.federation: self or duplicate peer');
    peers.add(peer.realmId);
  }
  const routing = spec.decisionRouting;
  if (routing.enabled && (!routing.providerRef || !routing.calibrationRef)) errors.push('spec.decisionRouting: enabled routing requires provider and calibration references');
  if (!routing.enabled && (routing.providerRef || routing.calibrationRef)) errors.push('spec.decisionRouting: disabled routing must not declare active provider/calibration');
  return { ok: errors.length === 0, errors, runtimeVerified: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node tools/validate-realm.mjs REALM.json');
    const result = validateRealm(parseStrictJSON(fs.readFileSync(process.argv[2], 'utf8')));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  } catch {
    // Do not echo arbitrary input values or a JSON parser's payload excerpt.
    console.error('Realm validation failed: unreadable/invalid JSON, duplicate keys, or invalid invocation.');
    process.exitCode = 1;
  }
}
