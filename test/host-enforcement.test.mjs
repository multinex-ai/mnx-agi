import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectProtectedPath, prepareManagedPolicies, auditEnforcement } from '../src/host-enforcement.mjs';

const protectedIo = {
  realpathSync: x => x,
  lstatSync: () => ({ uid: 0, mode: 0o755, isSymbolicLink: () => false }),
};
test('root-owned leaf in a user-writable ancestor is not trusted', () => {
  const io = { ...protectedIo, lstatSync: x => ({ uid: x === '/trusted' ? 501 : 0, mode: 0o755, isSymbolicLink: () => false }) };
  assert.equal(inspectProtectedPath('/trusted/bin/gateway', io).protected, false);
});
test('world-writable directory and aliased executable are rejected', () => {
  const writable = { ...protectedIo, lstatSync: () => ({ uid: 0, mode: 0o777, isSymbolicLink: () => false }) };
  assert.equal(inspectProtectedPath('/bin/gateway', writable).protected, false);
  assert.equal(inspectProtectedPath('/bin/gateway', { ...protectedIo, realpathSync: () => '/other/gateway' }).protected, false);
});
test('prepared policy pins a complete invocation and closes known host MCP/plugin paths', () => {
  const bundle = prepareManagedPolicies({ brokerExecutable: '/opt/managed/gateway' });
  assert.equal(bundle.systemSealed, false);
  const codex = bundle.files.find(x => x.name === 'codex').content;
  assert.match(codex, /executable = "\/opt\/managed\/gateway", args = \[\]/);
  assert.match(codex, /apps = false/); assert.match(codex, /plugins = false/);
  assert.doesNotMatch(codex, /danger-full-access/);
  const claude = JSON.parse(bundle.files.find(x => x.name === 'claude').content);
  assert.deepEqual(Object.keys(claude.mcpServers), ['mnx_memq_guard']);
  assert.throws(() => prepareManagedPolicies({ brokerExecutable: '/opt/managed/bad\npath' }));
});
test('files, emails and synthetic namespace failures cannot establish live account isolation', () => {
  const result = auditEnforcement({ brokerExecutable: '/opt/managed/gateway', io: protectedIo, evidence: { accounts: [{email:'one@example.invalid',namespace:'org:same'}, {email:'two@example.invalid',namespace:'org:same'}] } });
  assert.equal(result.readyForAcceptance, false);
  assert.ok(result.missing.includes('two_independent_accounts'));
  assert.ok(result.missing.includes('live_cross_account_denials'));
});
test('a claimed full set of gates is still not a system-wide attestation', () => {
  const evidence = { credentialIsolation: true, codexPolicyObserved: true, claudePolicyObserved: true, shellBypassDenied: true, pluginBypassDenied: true, configOverrideDenied: true, injectedToolBypassDenied: true, galileoBoundaryVerified: true, principalBindingVerified: true, crossAccountReadDenied: true, crossAccountWriteDenied: true, freshSessionResume: true, accounts: [{subject:'one',namespace:'org:one'}, {subject:'two',namespace:'org:two'}], checkedAt: 100 };
  const result = auditEnforcement({ brokerExecutable: '/opt/managed/gateway', io: protectedIo, evidence, now: 101 });
  assert.equal(result.readyForAcceptance, true);
  assert.equal(result.systemSealed, false);
  assert.ok(auditEnforcement({ brokerExecutable: '/opt/managed/gateway', io: protectedIo, evidence, now: 100 + 25*60*60*1000 }).missing.includes('evidence_current'));
});
