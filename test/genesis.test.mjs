import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, contentDigest, verifyGenesis } from '../src/genesis.mjs';

import { genesisFixture } from './fixtures/genesis.mjs';

test('genesis verifies signed founder, realm and adopted artifact digests', () => {
  const f = genesisFixture(), r = verifyGenesis(f);
  assert.equal(r.founder.displayName, 'Christopher Rijos'); assert.equal(r.genesisDigest, contentDigest(f.signed.manifest));
});
test('genesis refuses tampering, different authority, revocation and wrong artifact', () => {
  for (const mutate of [f => f.signed.manifest.systemId = 'tampered', f => f.expected.founderIdentityRef = 'other',
    f => f.revokedKeyIds = ['fixture-key'], f => f.expected.accordSha256 = '0'.repeat(64), f => f.trustedKeys = {},
    f => f.signed.manifest.founder.role = 'self-appointed', f => f.now = 0]) {
    const f = genesisFixture(); mutate(f); assert.throws(() => verifyGenesis(f));
  }
});
test('canonical JSON is ordered, deterministic and rejects non-JSON values', () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
  for (const value of [NaN, { x: undefined }, new Date(), JSON.parse('{"__proto__":{}}')]) assert.throws(() => canonicalJson(value));
});

test('canonical JSON v1 fixed Unicode bytes and dense arrays are portable', () => {
  assert.equal(canonicalJson({ z: [true, null, -0], 'é': '🧠\n', a: 1 }), '{"a":1,"z":[true,null,0],"é":"🧠\\n"}');
  const sparse = new Array(2), decorated = [1]; decorated.extra = 1;
  for (const value of [sparse, decorated, [undefined], Infinity, { x: Infinity }]) assert.throws(() => canonicalJson(value));
});
test('genesis rejects invalid clocks, ambiguous timestamps and non-Ed25519 roots', () => {
  for (const mutate of [f => f.now = NaN, f => f.now = Infinity, f => f.now = -1,
    f => f.signed.manifest.createdAt = '2026-02-30T00:00:00.000Z',
    f => f.signed.manifest.createdAt = '2026-01-01T00:00:00Z',
    f => f.trustedKeys = { 'fixture-key': 'invalid-key' }]) {
    const f = genesisFixture(); mutate(f); assert.throws(() => verifyGenesis(f));
  }
});

test('genesis trust accepts public Ed25519 keys only', () => {
  const f = genesisFixture();
  f.trustedKeys = { 'fixture-key': generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ type: 'spki', format: 'pem' }) };
  assert.throws(() => verifyGenesis(f), /invalid_genesis_trust/);
});
