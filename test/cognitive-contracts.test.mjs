import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalJson, parseContract, validateContract } from '../src/cognitive-contracts.mjs';
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/cognitive-contract-fixtures.json', import.meta.url)));
for (const [index, fixture] of fixtures.entries()) test(`shared cognitive contract fixture ${index}: ${fixture.contract} ${fixture.valid ? 'accept' : 'reject'}`, () => {
  const run = () => fixture.json ? parseContract(fixture.contract, fixture.json) : validateContract(fixture.contract, fixture.value);
  if (fixture.valid) assert.doesNotThrow(run); else assert.throws(run);
});
test('shared contract parser rejects non-JSON executable values and unsafe nested keys', () => {
  for (const procedure of [{ f: undefined }, { ['__proto__']: {} }, new Date(), new Array(3)]) {
    assert.throws(() => validateContract('skill', { id: 'a', environment: 'e', procedure }));
  }
  assert.equal(canonicalJson({ 'é': '🧠\n', a: [1, -0, null] }), '{"a":[1,0,null],"é":"🧠\\n"}');
});
