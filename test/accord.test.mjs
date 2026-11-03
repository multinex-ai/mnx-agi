import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { install, verify, rollback } from '../src/install.mjs';
import { hash } from '../src/files.mjs';
import { preferences } from '../src/accord.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const global = { scope: 'global', hosts: ['codex', 'claude'] };
const bundle = text => ({ version: '1.0.0', digest: hash(text), files: new Map([['constitution/CORE.md', Buffer.from(text)]]) });
function home(t) { const p = fs.mkdtempSync(path.join(os.tmpdir(), 'mnx-accord-')); t.after(() => fs.rmSync(p, { recursive: true, force: true })); return p; }
const config = target => path.join(target, '.mnx-agi/accord.json');
const read = target => JSON.parse(fs.readFileSync(config(target), 'utf8'));

test('first-run setup previews without acceptance and creates no home', t => {
  const target = path.join(home(t), 'uncreated');
  const result = spawnSync(process.execPath, [path.join(root, 'bin/mnx-agi.mjs'), 'setup', '--global', '--dir', target], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).needsAcceptance, true);
  assert.equal(fs.existsSync(target), false);
});
test('accepted configuration pins exact policy, stays private and is idempotent', t => {
  const target = home(t), b = bundle('Approved policy');
  const options = { ...global, acceptAccord: true, configuration: { stack: 'rust-typescript' } };
  install(b, target, options);
  const first = fs.readFileSync(config(target), 'utf8');
  assert.equal(read(target).adoption.coreDigest, hash('Approved policy'));
  assert.equal(read(target).preferences.stack, 'rust-typescript');
  assert.equal(fs.statSync(config(target)).mode & 0o777, 0o600);
  assert.equal(verify(target, 'global').accord.state, 'accepted');
  assert.equal(install(b, target, options).changed.length, 0);
  assert.equal(fs.readFileSync(config(target), 'utf8'), first);
});
test('pending adoption can be accepted; a changed policy needs fresh review', t => {
  const target = home(t);
  install(bundle('Policy one'), target, global);
  assert.equal(verify(target, 'global').accord.state, 'pending');
  install(bundle('Policy one'), target, { ...global, acceptAccord: true });
  assert.equal(verify(target, 'global').accord.state, 'accepted');
  install(bundle('Policy two'), target, global);
  assert.equal(verify(target, 'global').accord.state, 'review-required');
  assert.throws(() => install(bundle('Policy two'), target, { ...global, acceptAccord: true }), /replace-configuration/);
  install(bundle('Policy two'), target, { ...global, acceptAccord: true, replaceConfiguration: true });
  assert.equal(verify(target, 'global').accord.state, 'accepted');
});
test('configuration replacement preserves unrelated host rules and rolls back exactly', t => {
  const target = home(t), b = bundle('Policy');
  fs.mkdirSync(path.join(target, '.codex'));
  fs.writeFileSync(path.join(target, '.codex/AGENTS.md'), 'Existing client account boundary\n');
  install(b, target, { ...global, acceptAccord: true });
  const before = fs.readFileSync(config(target));
  assert.throws(() => install(b, target, { ...global, acceptAccord: true, configuration: { profile: 'multinex' } }), /replace-configuration/);
  install(b, target, { ...global, acceptAccord: true, replaceConfiguration: true, configuration: { profile: 'multinex' } });
  assert.match(fs.readFileSync(path.join(target, '.codex/AGENTS.md'), 'utf8'), /^Existing client account boundary/);
  rollback(target, 'global');
  assert.deepEqual(fs.readFileSync(config(target)), before);
});
test('MemQ configuration declares references but never asserts authentication or enforcement', t => {
  const target = home(t);
  install(bundle('Policy'), target, { ...global, acceptAccord: true, configuration: { memory: { adapter: 'memq', mode: 'required', onUnavailable: 'pause-dependent', connectionRef: 'approved-connection', identityRef: 'approved-identity', expectedNamespace: 'org:example' }, excludedProjectRefs: ['separate-client'] } });
  const result = verify(target, 'global');
  assert.equal(result.accord.memoryAdapter, 'memq');
  assert.equal(result.accord.memoryVerified, false);
  assert.equal(result.accord.enforcementVerified, false);
  assert.equal(result.runtimeVerified, false);
  assert.equal(JSON.stringify(result).includes('org:example'), false);
});
test('secret fields and permissive required-memory fallback are rejected', () => {
  for (const input of [{ profile: null }, { memory: null }, { stack: null }, { excludedProjectRefs: null }]) assert.throws(() => preferences(input), /Invalid private Accord/);
  for (const input of [{ password: 'not-a-credential' }, { memory: { adapter: 'memq', mode: 'required', onUnavailable: 'local-only', connectionRef: 'one', identityRef: 'two', expectedNamespace: 'org:example' } }, { memory: { adapter: 'local', mode: 'local', onUnavailable: 'local-only', access_token: 'not-a-token' } }, { excludedProjectRefs: ['same', 'same'] }]) assert.throws(() => preferences(input), /Invalid private Accord/);
});
test('missing or publicly readable private configuration is reported and never silently replaced', t => {
  const target = home(t), b = bundle('Policy');
  install(b, target, { ...global, acceptAccord: true });
  fs.chmodSync(config(target), 0o644);
  assert.equal(verify(target, 'global').ok, false);
  assert.throws(() => install(b, target, global), /private, owner-controlled/);
  fs.chmodSync(config(target), 0o600);
  fs.unlinkSync(config(target));
  assert.equal(verify(target, 'global').ok, false);
  assert.throws(() => install(b, target, global), /removed/);
  assert.equal(fs.existsSync(config(target)), false);
});
test('CLI setup reads a private configuration without echoing its scope and doctor reports adoption', t => {
  const target = path.join(home(t), 'target'), input = path.join(home(t), 'preferences.json');
  fs.writeFileSync(input, JSON.stringify({ memory: { adapter: 'memq', mode: 'preferred', onUnavailable: 'local-only', connectionRef: 'private-connection', identityRef: 'private-binding', expectedNamespace: 'org:private-fixture' } }));
  const run = (...args) => spawnSync(process.execPath, [path.join(root, 'bin/mnx-agi.mjs'), ...args], { encoding: 'utf8' });
  const setup = run('setup', '--global', '--hosts', 'codex,claude', '--dir', target, '--config', input, '--accept-accord');
  assert.equal(setup.status, 0, setup.stderr);
  assert.equal(JSON.parse(setup.stdout).accord.state, 'accepted');
  assert.equal(setup.stdout.includes('org:private-fixture'), false);
  const doctor = run('doctor', '--global', '--dir', target);
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.equal(JSON.parse(doctor.stdout).accord.memoryVerified, false);
  assert.equal(read(target).preferences.memory.identityRef, 'private-binding');
});
test('CLI rejects configuration secrets and acceptance flags on unrelated commands before mutation', t => {
  const target = path.join(home(t), 'target'), input = path.join(home(t), 'invalid.json');
  fs.writeFileSync(input, JSON.stringify({ password: 'private_configuration_marker' }));
  for (const args of [
    ['setup', '--global', '--dir', target, '--config', input, '--accept-accord'],
    ['init', '--global', '--dir', target, '--accept-accord'],
    ['setup', '--global', '--dir', target, '--replace-configuration'],
  ]) {
    const run = spawnSync(process.execPath, [path.join(root, 'bin/mnx-agi.mjs'), ...args], { encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.equal((run.stdout + run.stderr).includes('private_configuration_marker'), false);
    assert.equal(fs.existsSync(target), false);
  }
});
