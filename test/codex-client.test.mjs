import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connectCodex } from '../src/codex-memq-client.mjs';

function host(t, store) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnx-client-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const executable = path.join(dir, 'host');
  const code = `#!${process.execPath}
import {createInterface} from 'node:readline';
if(process.env.CODEX_HOME!==${JSON.stringify(dir)})process.exit(3);
if(process.argv[2]==='mcp') { console.log(JSON.stringify([{name:'fixture',transport:{type:'streamable_http',url:'https://mcp.multinex.ai/mcp/v1'}}])); process.exit(0); }
createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id==null)return;
let result={};
if(r.method==='config/read')result={config:{mcp_oauth_credentials_store:${JSON.stringify(store)}}};
if(r.method==='thread/start')result={thread:{id:'fixture-thread'}};
if(r.method==='mcpServer/tool/call')result={homeMatched:process.env.CODEX_HOME===${JSON.stringify(dir)}};
process.stdout.write(JSON.stringify({id:r.id,result})+'\\n');});`;
  fs.writeFileSync(executable, code, { mode: 0o700 });
  return { executable, cwd: dir, server: 'fixture', codexHome: dir, timeoutMs: 5000 };
}

test('an isolated client refuses an effective shared credential store', { skip: process.platform === 'win32' }, async t => {
  await assert.rejects(connectCodex(host(t, 'auto')), /isolated_oauth_store_required/);
});

test('an isolated client passes its own home to both inventory and host', { skip: process.platform === 'win32' }, async t => {
  const client = await connectCodex(host(t, 'file'));
  try { assert.equal((await client.call('reunion', {})).homeMatched, true); }
  finally { client.close(); }
});
