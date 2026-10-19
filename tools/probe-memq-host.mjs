// Explicit live synthetic-write acceptance probe. Arguments: launcher workspace plan-id.
// No agent/model turn is started; calls use Codex's supported MCP host API.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import assert from 'node:assert/strict';
const [launcher, cwd, planId] = process.argv.slice(2);
if (!launcher || !cwd || !planId) throw new Error('Usage: probe-memq-host launcher workspace unique-synthetic-plan-id');
const child = spawn(launcher, ['app-server'], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
child.stderr.resume();
const pending = new Map(); let id = 0;
const rpc = (method, params) => new Promise((resolve, reject) => {
  const key = ++id;
  const timer = setTimeout(() => { pending.delete(key); reject(new Error('probe_timeout')); child.kill(); }, 120000);
  pending.set(key, { resolve, reject, timer }); child.stdin.write(JSON.stringify({ id: key, method, params }) + '\n');
});
createInterface({ input: child.stdout }).on('line', line => {
  const value = JSON.parse(line), entry = pending.get(value.id);
  if (!entry) return;
  clearTimeout(entry.timer); pending.delete(value.id);
  value.error ? entry.reject(new Error('probe_rpc_error')) : entry.resolve(value.result);
});
child.on('exit', () => { for (const x of pending.values()) { clearTimeout(x.timer); x.reject(new Error('host_exited')); } pending.clear(); });
try {
  await rpc('initialize', { clientInfo: { name: 'mnx_guard_probe', version: '0.1.0' }, capabilities: { experimentalApi: true } });
  child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
  const { thread } = await rpc('thread/start', { cwd, ephemeral: true, approvalPolicy: 'never', sandbox: 'read-only' });
  const inventory = await rpc('mcpServerStatus/list', { threadId: thread.id });
  console.log(JSON.stringify({ phase: 'inventory', servers: inventory.data.map(x => ({ name: x.name, tools: Object.keys(x.tools).length })) }));
  let directDenied = false;
  try { await rpc('mcpServer/tool/call', { threadId: thread.id, server: 'memq_multinex', tool: 'reunion', arguments: {} }); }
  catch { directDenied = true; }
  assert.equal(directDenied, true, 'direct upstream remains callable in this host');
  console.log(JSON.stringify({ check: 'direct_memq_host_call', denied: true }));
  const call = (tool, args) => rpc('mcpServer/tool/call', { threadId: thread.id, server: 'mnx_memq_guard', tool, arguments: args });
  const write = await call('plan_write', { plan_id: planId, expected_state_version: 0, state_patch: { synthetic: true, probe: 'guard-host-7319' } });
  assert.notEqual(write.isError, true, 'synthetic conditional write failed');
  const read = await call('plan_read', { plan_id: planId });
  assert.notEqual(read.isError, true);
  const body = JSON.parse(read.content[0].text);
  assert.equal(body.state.probe, 'guard-host-7319'); assert.equal(body.state_version, 1);
  for (const [name, tool, args] of [
    ['stale_version', 'plan_write', { plan_id: planId, expected_state_version: 0, state_patch: { probe: 'must-not-apply' } }],
    ['namespace_override', 'plan_read', { plan_id: planId, namespace: 'org:synthetic-denied' }],
    ['foreign_plan', 'plan_read', { plan_id: 'synthetic-other-realm' }],
    ['unsupported_tool', 'reflect_memory', {}],
  ]) {
    assert.equal((await call(tool, args)).isError, true, name); console.log(JSON.stringify({ check: name, denied: true }));
  }
  const final = JSON.parse((await call('plan_read', { plan_id: planId })).content[0].text);
  assert.equal(final.state.probe, 'guard-host-7319'); assert.equal(final.state_version, 1);
  console.log(JSON.stringify({ hostRoundTrip: true, conditionalWrite: true, readBack: true, unchangedAfterDenials: true, systemSealed: false }));
} finally { child.kill(); }
