import { generateKeyPairSync, sign } from 'node:crypto';
import { contentDigest, genesisSigningBytes } from '../../src/genesis.mjs';

export function genesisFixture() {
  const key = generateKeyPairSync('ed25519');
  const manifest = { schemaVersion: 1, systemId: 'research-one', realm: 'research', createdAt: '2026-01-01T00:00:00.000Z',
    founder: { displayName: 'Christopher Rijos', role: 'Supreme Architect', identityRef: 'fixture-founder' },
    accordSha256: contentDigest('adopted accord'), amendmentPolicySha256: contentDigest('approval policy'), keyId: 'fixture-key' };
  const signed = { manifest, signature: sign(null, genesisSigningBytes(manifest), key.privateKey).toString('base64') };
  const expected = { systemId: manifest.systemId, realm: manifest.realm, founderIdentityRef: manifest.founder.identityRef,
    accordSha256: manifest.accordSha256, amendmentPolicySha256: manifest.amendmentPolicySha256 };
  return { signed, expected, trustedKeys: { 'fixture-key': key.publicKey.export({ type: 'spki', format: 'pem' }) } };
}
