import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { parseStrictJSON, validateRealm } from '../tools/validate-realm.mjs';

const example = name => JSON.parse(fs.readFileSync(new URL(`../examples/${name}.realm.json`, import.meta.url), 'utf8'));
const reject = mutate => { const value = example('local'); mutate(value); assert.equal(validateRealm(value).ok, false); };

for (const name of ['local', 'team', 'federated']) {
  test(`${name} example is valid configuration but not runtime verification`, () => {
    const result = validateRealm(example(name));
    assert.deepEqual(result.errors, []);
    assert.equal(result.ok, true);
    assert.equal(result.runtimeVerified, false);
  });
}
test('reject unsupported schema version', () => reject(v => v.apiVersion = 'mnx-agi/v99'));
test('reject unknown secret-like fields without printing values', () => {
  const v = example('local'); v.spec.memory.apiKey = 'synthetic-sensitive-value';
  const result = validateRealm(v);
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(result).includes('synthetic-sensitive-value'), false);
});
test('reject duplicate JSON keys and escaped equivalents', () => {
  assert.throws(() => parseStrictJSON('{"a":1,"a":2}'));
  assert.throws(() => parseStrictJSON('{"a":{"id":1,"\\u0069d":2}}'));
  assert.deepEqual(parseStrictJSON('{"a":{"id":1},"b":{"id":2},"c":[null,true,"a,b"]}'), { a:{id:1}, b:{id:2}, c:[null,true,'a,b'] });
});
test('reject absolute, traversal, backslash, URL and newline policy paths', () => {
  for (const path of ['/etc/policy','../policy','.realm/../policy','C:\\policy','https://example.com/policy','.realm/policy\n']) reject(v => v.spec.policyPath = path);
});
test('reject required memory with permissive fallback', () => reject(v => v.spec.memory = {adapter:'memq',mode:'required',expectedNamespace:'example',identityRef:'identity:example',onUnavailable:'local-only'}));
test('reject remote memory without an expected namespace', () => reject(v => v.spec.memory = {adapter:'memq',mode:'preferred',onUnavailable:'local-only'}));
test('reject remote namespace on local mode', () => reject(v => v.spec.memory.expectedNamespace = 'example'));
test('reject claiming concurrent ownership through single-writer mode', () => reject(v => v.spec.coordination.maxWorkers = 2));
test('independent externally coordinated peers do not require nested delegation', () => {
  const v = example('team'); v.spec.budgets.maxDelegationDepth = 0;
  assert.equal(validateRealm(v).ok, true);
});
test('reject peers on an isolated realm', () => reject(v => v.spec.federation.peers = example('federated').spec.federation.peers));
test('reject self peer and duplicate peer IDs with different grants', () => {
  const v = example('federated'); v.spec.federation.peers[0].realmId = v.metadata.id;
  assert.equal(validateRealm(v).ok, false);
  const w = example('federated'); w.spec.federation.peers.push({...w.spec.federation.peers[0],grantRef:'grant:different'});
  assert.equal(validateRealm(w).ok, false);
});
test('reject private export class and unrecognized grant operations', () => {
  for (const [key, val] of [['dataClasses',['private']],['operations',['everything']]]) {
    const v = example('federated'); v.spec.federation.peers[0][key] = val;
    assert.equal(validateRealm(v).ok, false);
  }
});
test('reject uncalibrated decision routing and accept explicit proposed references', () => {
  reject(v => v.spec.decisionRouting = {enabled:true,providerRef:'jev'});
  const v = example('local'); v.spec.decisionRouting = {enabled:true,providerRef:'jev',calibrationRef:'eval:synthetic-v1'};
  assert.equal(validateRealm(v).ok, true);
  assert.equal(validateRealm(v).runtimeVerified, false);
});
test('reject unbounded or invalid budgets', () => {
  for (const n of [0,-1,Infinity,1.5]) reject(v => v.spec.budgets.maxToolCalls = n);
});
test('reject self parent', () => reject(v => v.metadata.parentId = v.metadata.id));
test('valid grant reference does not certify a grant', () => {
  const v = example('federated'); v.spec.federation.peers[0].grantRef = 'grant:does-not-exist';
  assert.equal(validateRealm(v).ok, true);
  assert.equal(validateRealm(v).runtimeVerified, false);
});

test('remote namespaces require an explicit private principal/service binding reference', () => { const v = example('team'); delete v.spec.memory.identityRef; assert.equal(validateRealm(v).ok, false); });
