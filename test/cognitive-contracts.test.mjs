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
test('array index accessors are rejected before canonicalization or contract validation invokes them', () => {
  for (const enumerable of [true, false]) {
    let calls = 0;
    const values = [0];
    Object.defineProperty(values, '0', { enumerable, get() { return ++calls; } });
    assert.throws(() => canonicalJson(values), /non_json_array/);
    assert.throws(() => validateContract('skill', { id: 'a', environment: 'e', procedure: values }), /non_json_array/);
    assert.equal(calls, 0);
  }
});
test('changed array prototypes cannot substitute callbacks or alternate canonical values', () => {
  let calls = 0;
  const values = [1];
  Object.setPrototypeOf(values, {
    some() { calls++; return false; }, map() { calls++; return [2]; }, every() { calls++; return true; },
  });
  assert.throws(() => canonicalJson(values), /non_json_array/);
  assert.throws(() => validateContract('skill', { id: 'a', environment: 'e', procedure: values }), /non_json_array/);
  assert.equal(calls, 0);
  const stable = [1];
  Object.defineProperty(stable, '0', { value: 1, enumerable: false });
  assert.equal(canonicalJson(stable), '[1]');
});
