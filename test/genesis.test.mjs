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
