import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';

// Uses Codex's OAuth client. Never reads, exports, or copies its credentials.
export async function connectCodex({ executable = 'codex', cwd, server, timeoutMs = 45000, codexHome }) {
  // An explicitly provisioned home keeps two independently authenticated test
  // clients separate. Never seed it by copying another client's credentials.
  const env = codexHome ? { ...process.env, CODEX_HOME: codexHome } : process.env;
  const inventory = JSON.parse(execFileSync(executable, ['mcp', 'list', '--json'], { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  if (!inventory.some(item => item.name === server)) throw new Error('upstream_unavailable');
  if (inventory.some(item => !/^[A-Za-z0-9_-]+$/.test(item.name))) throw new Error('unsupported_server_name');
  const upstream = inventory.find(item => item.name === server).transport;
  if (upstream.type !== 'streamable_http' || upstream.url !== 'https://mcp.multinex.ai/mcp/v1') throw new Error('unsupported_upstream');
  const disabled = inventory.filter(item => item.name !== server).map(item => `${item.name}={enabled=false,${item.transport.type === 'streamable_http' ? `url=${JSON.stringify(item.transport.url)}` : 'command="/usr/bin/false"'}}`);
  const overrides = ['-c', `mcp_servers={${[...disabled, `${server}={url=${JSON.stringify(upstream.url)},enabled=true}`].join(',')}}`];
  const child = spawn(executable, ['app-server', ...overrides], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  let sequence = 0, closed = false;
  const pending = new Map();
  const close = () => {
    closed = true;
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('transport_closed')); }
    pending.clear(); child.kill();
  };
  child.on('error', close); child.on('exit', close);
  child.stderr.resume(); // Upstream diagnostics may contain private configuration.
  createInterface({ input: child.stdout }).on('line', line => {
    let message;
    try { message = JSON.parse(line); } catch { close(); return; }
    if (message.method && message.id != null) {
      // Never approve unexpected upstream elicitation or host actions.
      child.stdin.write(JSON.stringify({ id: message.id, error: { code: -32601, message: 'Unsupported request' } }) + '\n');
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id); clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error('upstream_rpc_error'));
    else entry.resolve(message.result);
  });
  function rpc(method, params) {
    if (closed) return Promise.reject(new Error('transport_closed'));
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('transport_timeout_outcome_unknown')); close(); }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }
  try {
    await rpc('initialize', { clientInfo: { name: 'mnx_memq_guard', version: '0.1.0' }, capabilities: { experimentalApi: true } });
    child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
    if (codexHome) {
      // A separate home alone does not establish isolation with a shared OS
      // keyring. Require the effective, host-resolved file-store configuration.
      const resolved = await rpc('config/read', { cwd, includeLayers: false });
      if (resolved.config?.mcp_oauth_credentials_store !== 'file') throw new Error('isolated_oauth_store_required');
    }
    const started = await rpc('thread/start', { cwd, ephemeral: true, approvalPolicy: 'never', sandbox: 'read-only' });
    const threadId = started.thread.id;
    return { close, call: (tool, args) => rpc('mcpServer/tool/call', { threadId, server, tool, arguments: args }) };
  } catch (error) { close(); throw error; }
}

export function unwrapMemq(response) {
  if (response?.isError) throw new Error('memq_error');
  const blocks = response?.content?.filter(x => x.type === 'text');
  if (blocks?.length !== 1) throw new Error('invalid_memq_response');
  let body;
  try { body = JSON.parse(blocks[0].text); } catch { throw new Error('invalid_memq_response'); }
  if (body.ok !== true || !body.result) throw new Error('memq_operation_failed');
  return body.result;
}
