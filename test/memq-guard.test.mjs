import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createMemqGuard, verifyWorkspace } from '../src/memq-guard.mjs';

const envelope = result => ({ content: [{ type: 'text', text: JSON.stringify({ ok: true, result }) }] });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mnx-guard-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = { workspace: root, deniedRoots: [path.join(root, 'client')], namespace: 'org:fixture', planPrefix: 'mnx-test-' };
  const calls = [], audit = [];
  const call = async (tool, args) => { calls.push({ tool, args }); return envelope(tool === 'reunion' ? { access: { namespace: config.namespace, namespace_scoped: true, auth_source: 'oauth_billing_manager' } } : { namespace: config.namespace, plan_id: args.plan_id, state: { value: 1 } }); };
  return { root, config, calls, audit, call, guard: createMemqGuard({ config, call, cwd: root, audit: async x => audit.push(x) }) };
}
test('allowed call binds namespace and verifies identity each time', async t => {
  const f = fixture(t);
  await f.guard.execute('plan_read', { plan_id: 'mnx-test-one' });
  await f.guard.execute('plan_read', { plan_id: 'mnx-test-two' });
  assert.equal(f.calls.filter(x => x.tool === 'reunion').length, 2);
  assert.equal(f.calls[1].args.namespace, f.config.namespace);
  assert.ok(!JSON.stringify(f.audit).includes('mnx-test'));
});
for (const [label, tool, args] of [
  ['foreign namespace', 'plan_read', { plan_id: 'mnx-test-one', namespace: 'org:foreign' }],
  ['foreign plan', 'plan_read', { plan_id: 'foreign-plan' }],
  ['learning', 'reflect_memory', {}],
  ['unconditional write', 'plan_write', { plan_id: 'mnx-test-one', state_patch: {} }],
  ['malformed patch', 'plan_write', { plan_id: 'mnx-test-one', expected_state_version: 0, state_patch: [] }],
  ['nested override', 'plan_read', { plan_id: 'mnx-test-one', metadata: { namespace: 'foreign' } }],
]) test(`${label} denied without upstream access`, async t => {
  const f = fixture(t); await assert.rejects(f.guard.execute(tool, args)); assert.equal(f.calls.length, 0);
});
test('changed identity prevents data access', async t => {
  const f = fixture(t); let count = 0;
  const guard = createMemqGuard({ config: f.config, cwd: f.root, audit: async () => {}, call: async () => { count++; return envelope({ access: { namespace: 'org:foreign', namespace_scoped: true, auth_source: 'oauth_billing_manager' } }); } });
  await assert.rejects(guard.execute('plan_read', { plan_id: 'mnx-test-one' }), /identity_mismatch/); assert.equal(count, 1);
});
test('unavailable audit blocks dispatch', async t => {
  const f = fixture(t), guard = createMemqGuard({ config: f.config, cwd: f.root, call: f.call, audit: async () => { throw new Error('offline'); } });
  await assert.rejects(guard.execute('plan_read', { plan_id: 'mnx-test-one' })); assert.equal(f.calls.length, 1);
});
test('foreign response is withheld and mutations are never retried', async t => {
  const f = fixture(t); let writes = 0;
  const guard = createMemqGuard({ config: f.config, cwd: f.root, audit: async () => {}, call: async (tool, args) => {
    if (tool === 'reunion') return f.call(tool, args);
    writes++; return envelope({ namespace: 'org:foreign', plan_id: args.plan_id });
  } });
  await assert.rejects(guard.execute('plan_write', { plan_id: 'mnx-test-one', expected_state_version: 0, state_patch: {} }), /response_scope_mismatch/);
  assert.equal(writes, 1);
});
test('symlink into denied root is rejected', t => {
  const f = fixture(t), denied = f.config.deniedRoots[0]; fs.mkdirSync(denied); const link = path.join(f.root, 'alias'); fs.symlinkSync(denied, link);
  assert.throws(() => verifyWorkspace(f.config, link), /workspace_denied/);
});
test('linked worktree belonging to denied repository is rejected', t => {
  const f = fixture(t), denied = f.config.deniedRoots[0]; fs.mkdirSync(denied);
  const git = args => execFileSync('git', args, { cwd: denied, stdio: 'ignore' });
  git(['init']); git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-m', 'fixture']);
  const linked = path.join(f.root, 'linked'); git(['worktree', 'add', '--detach', linked]);
  assert.throws(() => verifyWorkspace(f.config, linked), /workspace_denied/);
});

test('a nested repository does not inherit its parent workspace memory', t => {
  const f = fixture(t), nested = path.join(f.root, 'different-project'); fs.mkdirSync(nested);
  execFileSync('git', ['init'], { cwd: nested, stdio: 'ignore' });
  assert.throws(() => verifyWorkspace(f.config, nested), /workspace_repository_mismatch/);
});

test('unresolved repository ownership fails closed from a descendant', t => {
  const f = fixture(t), nested = path.join(f.root, 'src'); fs.mkdirSync(nested);
  fs.writeFileSync(path.join(f.root, '.git'), 'gitdir: missing-repository\n');
  assert.throws(() => verifyWorkspace(f.config, nested), /git_ownership_unresolved/);
});

test('an ordinary subdirectory of the same repository keeps its binding', t => {
  const f = fixture(t); execFileSync('git', ['init'], { cwd: f.root, stdio: 'ignore' });
  const nested = path.join(f.root, 'src'); fs.mkdirSync(nested);
  assert.equal(verifyWorkspace(f.config, nested), fs.realpathSync(nested));
});
