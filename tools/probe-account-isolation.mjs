// Explicit live synthetic-write test. Private input names two independently
// provisioned clients and namespaces. No credential is read or copied here.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { connectCodex, unwrapMemq } from '../src/codex-memq-client.mjs';
const [configPath] = process.argv.slice(2);
if (!configPath || process.argv.length !== 3) throw new Error('Usage: probe-account-isolation PRIVATE_CONFIG.json');
const input = JSON.parse(fs.readFileSync(configPath, 'utf8'));
assert.equal(input.syntheticWritesAuthorized, true);
assert.equal(input.clients?.length, 2);
const [a, b] = input.clients;
assert.ok(a.expectedNamespace && b.expectedNamespace && a.expectedNamespace !== b.expectedNamespace, 'independent namespaces required');
assert.ok(b.codexHome && a.codexHome !== b.codexHome, 'independently provisioned homes required');
const run = crypto.randomUUID();
const peers = [];
const log = result => process.stdout.write(JSON.stringify(result) + '\n');
async function identify(peer) {
  const r = unwrapMemq(await peer.client.call('reunion', { include_status: false }));
  assert.equal(r.access.namespace, peer.config.expectedNamespace, 'authenticated namespace mismatch');
  assert.equal(r.access.namespace_scoped, true);
  assert.equal(r.access.auth_source, 'oauth_billing_manager');
  return r.access;
}
async function call(peer, tool, args) { await identify(peer); return peer.client.call(tool, args); }
try {
  for (const [index, config] of input.clients.entries()) {
    const client = await connectCodex(config);
    const peer = { client, config, id: `mnx-isolation-${run}-${index}`, marker: crypto.randomUUID() };
    peers.push(peer);
    const access = await identify(peer);
    log({ phase: 'identity', peer: index, expectedNamespaceMatched: true, individualSubjectAvailable: typeof access.authenticated_subject === 'string' });
  }
  for (const peer of peers) {
    const result = unwrapMemq(await call(peer, 'plan_state_write', { namespace: peer.config.expectedNamespace, plan_id: peer.id, expected_state_version: 0, state_patch: { synthetic: true, isolationProbe: peer.marker } }));
    assert.equal(result.namespace, peer.config.expectedNamespace);
    assert.equal(result.plan_id, peer.id);
  }
  for (let i = 0; i < peers.length; i++) {
    const peer = peers[i], other = peers[1-i];
    for (const tool of ['plan_state_read', 'plan_state_write']) {
      const args = { namespace: other.config.expectedNamespace, plan_id: other.id };
      if (tool === 'plan_state_write') Object.assign(args, { expected_state_version: 1, state_patch: { isolationProbe: 'must-not-apply' } });
      const response = await call(peer, tool, args);
      let rejected = response.isError === true;
      if (!rejected) { try { unwrapMemq(response); } catch { rejected = true; } }
      assert.equal(rejected, true, 'foreign namespace operation must be rejected');
      log({ peer: i, check: tool, foreignNamespaceDenied: true });
    }
  }
  for (const peer of peers) {
    const result = unwrapMemq(await call(peer, 'plan_state_read', { namespace: peer.config.expectedNamespace, plan_id: peer.id }));
    assert.equal(result.namespace, peer.config.expectedNamespace);
    assert.equal(result.state.isolationProbe, peer.marker);
    assert.equal(result.state_version, 1);
    peer.client.close();
    peer.client = await connectCodex(peer.config);
    const fresh = unwrapMemq(await call(peer, 'plan_state_read', { namespace: peer.config.expectedNamespace, plan_id: peer.id }));
    assert.equal(fresh.state.isolationProbe, peer.marker);
    assert.equal(fresh.state_version, 1);
  }
  log({ organizationIsolationVerified: true, crossAccountReadDenied: true, crossAccountWriteDenied: true, freshSessionResume: true, individualUserIsolationVerified: false, systemSealed: false, syntheticRecordsRemain: true });
} finally { for (const peer of peers) peer.client.close(); }
