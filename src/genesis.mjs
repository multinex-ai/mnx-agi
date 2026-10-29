import { createPublicKey, verify } from 'node:crypto';
import { canonicalJson, canonicalTimestamp, contentDigest } from './cognitive-contracts.mjs';
export { canonicalJson, contentDigest } from './cognitive-contracts.mjs';
import { Buffer } from 'node:buffer';

const fail = code => { throw Object.assign(new Error(code), { code }); };
const nonempty = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 1024;
const digestPattern = /^[a-f0-9]{64}$/;

export function validateGenesis(manifest) {
  const fields = ['schemaVersion', 'systemId', 'realm', 'createdAt', 'founder', 'accordSha256', 'amendmentPolicySha256', 'keyId'];
  if (!manifest || Object.keys(manifest).sort().join() !== fields.sort().join() || manifest.schemaVersion !== 1 ||
      !['systemId', 'realm', 'keyId'].every(k => nonempty(manifest[k])) ||
      !digestPattern.test(manifest.accordSha256) || !digestPattern.test(manifest.amendmentPolicySha256) ||
      !canonicalTimestamp(manifest.createdAt)) fail('invalid_genesis');
  const founder = manifest.founder;
  if (!founder || Object.keys(founder).sort().join() !== 'displayName,identityRef,role' ||
      founder.displayName !== 'Christopher Rijos' || founder.role !== 'Supreme Architect' || !nonempty(founder.identityRef)) fail('invalid_founder_binding');
  canonicalJson(manifest);
  return structuredClone(manifest);
}

export function genesisSigningBytes(manifest) {
  return Buffer.from(`MNX-GENESIS-v1\n${canonicalJson(validateGenesis(manifest))}`);
}

/** Trust is provided by the host, never by a key embedded in the manifest. */
export function verifyGenesis({ signed, trustedKeys, expected, revokedKeyIds = [], now = Date.now() }) {
  if (!Number.isFinite(now) || !Number.isSafeInteger(now) || now < 0 || !Array.isArray(revokedKeyIds) || revokedKeyIds.some(id => !nonempty(id)) ||
      !trustedKeys || typeof trustedKeys !== 'object' || Array.isArray(trustedKeys) || Object.keys(trustedKeys).length > 32) fail('invalid_genesis_trust');
  canonicalJson(trustedKeys);
  for (const [id, pem] of Object.entries(trustedKeys)) {
    try {
      if (!nonempty(id) || typeof pem !== 'string' || pem.length > 4096 || !pem.startsWith('-----BEGIN PUBLIC KEY-----') || createPublicKey(pem).asymmetricKeyType !== 'ed25519') fail('invalid_genesis_trust');
    } catch { fail('invalid_genesis_trust'); }
  }
  if (!signed || Object.keys(signed).sort().join() !== 'manifest,signature') fail('invalid_signed_genesis');
  const manifest = validateGenesis(signed.manifest);
  if (!expected || !['systemId', 'realm', 'founderIdentityRef', 'accordSha256', 'amendmentPolicySha256'].every(k => nonempty(expected[k]))) fail('genesis_expectation_required');
  if (manifest.systemId !== expected.systemId || manifest.realm !== expected.realm ||
      manifest.founder.identityRef !== expected.founderIdentityRef || manifest.accordSha256 !== expected.accordSha256 ||
      manifest.amendmentPolicySha256 !== expected.amendmentPolicySha256 || Date.parse(manifest.createdAt) > now) fail('genesis_binding_mismatch');
  if (revokedKeyIds.includes(manifest.keyId) || !Object.hasOwn(trustedKeys ?? {}, manifest.keyId)) fail('genesis_key_not_trusted');
  try {
    const key = createPublicKey(trustedKeys[manifest.keyId]);
    if (key.asymmetricKeyType !== 'ed25519' || typeof signed.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(signed.signature) ||
        !verify(null, genesisSigningBytes(manifest), key, Buffer.from(signed.signature, 'base64'))) fail('genesis_signature_invalid');
  } catch { fail('genesis_signature_invalid'); }
  return Object.freeze({ systemId: manifest.systemId, realm: manifest.realm, genesisDigest: contentDigest(manifest), founder: Object.freeze({ ...manifest.founder }) });
}
