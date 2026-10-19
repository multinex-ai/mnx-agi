#!/usr/bin/env node
import fs from 'node:fs';
import { createInterface } from 'node:readline';
import { connectCodex } from '../src/codex-memq-client.mjs';
import { createMemqGuard, verifyWorkspace } from '../src/memq-guard.mjs';

const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
verifyWorkspace(config, process.cwd());
const client = await connectCodex({ executable: config.codexExecutable, cwd: process.cwd(), server: config.server });
const guard = createMemqGuard({ config, call: client.call, audit: async event => {
  fs.appendFileSync(config.auditPath, JSON.stringify({ ...event, at: new Date().toISOString() }) + '\n', { mode: 0o600 });
} });
const tools = [
  { name: 'plan_read', description: 'Read an exact plan in the configured isolated task prefix.', inputSchema: { type: 'object', additionalProperties: false, required: ['plan_id'], properties: { plan_id: { type: 'string' } } } },
  { name: 'plan_write', description: 'Conditional write to an isolated plan. A version is mandatory; unknown outcomes must be reconciled by reading.', inputSchema: { type: 'object', additionalProperties: false, required: ['plan_id', 'expected_state_version', 'state_patch'], properties: { plan_id: { type: 'string' }, expected_state_version: { type: 'integer', minimum: 0 }, state_patch: { type: 'object' } } } },
];
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
async function handle(line) {
  let request;
  try {
    if (Buffer.byteLength(line) > 32768) throw new Error(); request = JSON.parse(line);
    if (!request || Array.isArray(request) || typeof request !== 'object' || request.jsonrpc !== '2.0' || typeof request.method !== 'string') throw new Error();
  }
  catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid request' } }); return; }
  if (request.id == null) return;
  try {
    let result;
    if (request.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'mnx-memq-guard', version: '0.1.0' } };
    else if (request.method === 'ping') result = {};
    else if (request.method === 'tools/list') result = { tools };
    else if (request.method === 'tools/call') {
      try { result = { content: [{ type: 'text', text: JSON.stringify(await guard.execute(request.params.name, request.params.arguments)) }] }; }
      catch { result = { isError: true, content: [{ type: 'text', text: 'Request denied or outcome unconfirmed. Read before retrying a write.' }] }; }
    } else throw new Error('unsupported');
    send({ jsonrpc: '2.0', id: request.id, result });
  } catch { send({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Unsupported request' } }); }
}
const input = createInterface({ input: process.stdin });
let queue = Promise.resolve();
input.on('line', line => { queue = queue.then(() => handle(line)); });
input.on('close', () => { queue.finally(() => client.close()); });
process.on('SIGTERM', () => { client.close(); process.exit(0); });
