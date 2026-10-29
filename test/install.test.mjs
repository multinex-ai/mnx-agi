import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { install, verify, rollback } from '../src/install.mjs';
import { loadBundle } from '../src/bundle.mjs';
import { hash, safePath } from '../src/files.mjs';
import { parseStrictJSON } from '../tools/validate-realm.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const realm = fs.readFileSync(new URL('../examples/local.realm.json', import.meta.url));
function fixture(t) { const p = fs.mkdtempSync(path.join(os.tmpdir(), 'mnx test ')); t.after(() => fs.rmSync(p, { recursive: true, force: true })); return p; }
function bundle(version = '1.0.0') { return { version, digest: hash(version), files: new Map([['constitution/CORE.md', Buffer.from(`# Core ${version}\n`) ], ['examples/local.realm.json', realm], ['skills/mnx-example/SKILL.md', Buffer.from('example')], ['bin/mnx-agi.mjs', Buffer.from('console.log("ok")')]]) }; }
const globalOptions = { scope: 'global', hosts: ['codex','claude'] };
test('the release installs all eleven workflow skills for both hosts', t => {
  const target = fixture(t);
  const release = loadBundle(root);
  const skills = [...release.files.keys()].filter(name => /^skills\/[^/]+\/SKILL.md$/.test(name));
  assert.equal(skills.length, 11);
  install(release, target, globalOptions);
  for (const name of skills) for (const directory of ['.agents/skills', '.claude/skills']) {
    const relative = name.slice('skills/'.length);
    assert.deepEqual(fs.readFileSync(path.join(target, directory, relative)), release.files.get(name));
  }
});
function write(root, name, content) { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), content); }
function read(root, name) { return fs.readFileSync(path.join(root, name), 'utf8'); }

test('dry run on a missing home writes nothing', t => { const parent = fixture(t), target = path.join(parent, 'missing'); const result = install(bundle(), target, { ...globalOptions, dryRun: true }); assert.ok(result.changed.length); assert.equal(fs.existsSync(target), false); });
test('installation preserves private host rules and modes; rollback restores exact bytes', t => { const target = fixture(t); const original = 'Private local rule without final newline'; write(target,'.codex/AGENTS.md',original); fs.chmodSync(path.join(target,'.codex/AGENTS.md'),0o640); install(bundle(),target,globalOptions); assert.ok(read(target,'.codex/AGENTS.md').startsWith(original)); assert.equal(fs.statSync(path.join(target,'.codex/AGENTS.md')).mode & 0o777,0o640); assert.equal(verify(target,'global').ok,true); assert.deepEqual(install(bundle(),target,globalOptions).changed,[]); rollback(target,'global'); assert.equal(read(target,'.codex/AGENTS.md'),original); assert.equal(fs.existsSync(path.join(target,'.claude/CLAUDE.md')),false); });
test('upgrade accepts edits outside the core block and rollback preserves them',t=>{const target=fixture(t);install(bundle(),target,globalOptions);fs.appendFileSync(path.join(target,'.codex/AGENTS.md'),'\nPrivate addition\n');const before=read(target,'.codex/AGENTS.md');install(bundle('1.1.0'),target,globalOptions);assert.ok(read(target,'.codex/AGENTS.md').endsWith('Private addition\n'));rollback(target,'global');assert.equal(read(target,'.codex/AGENTS.md'),before);assert.equal(verify(target,'global').version,'1.0.0');});
test('modified core blocks are detected and never replaced',t=>{const target=fixture(t);install(bundle(),target,globalOptions);fs.appendFileSync(path.join(target,'.mnx-agi/package/constitution/CORE.md'),'edit');assert.equal(verify(target,'global').ok,false);assert.throws(()=>install(bundle('1.1.0'),target,globalOptions),/conflict/);});
test('modified instruction block blocks upgrade',t=>{const target=fixture(t);install(bundle(),target,globalOptions);write(target,'.codex/AGENTS.md',read(target,'.codex/AGENTS.md').replace('# Core','# Changed'));assert.throws(()=>install(bundle('1.1.0'),target,globalOptions),/block conflict/);});
test('rollback refuses subsequent work before restoring any file',t=>{const target=fixture(t);install(bundle(),target,globalOptions);const original=read(target,'.claude/CLAUDE.md');fs.appendFileSync(path.join(target,'.codex/AGENTS.md'),'new work');assert.throws(()=>rollback(target,'global'),/newer work/);assert.equal(read(target,'.claude/CLAUDE.md'),original);});
test('unowned conflicting skills are preserved',t=>{const target=fixture(t);write(target,'.agents/skills/mnx-example/SKILL.md','existing');assert.throws(()=>install(bundle(),target,globalOptions),/conflict/);assert.equal(read(target,'.agents/skills/mnx-example/SKILL.md'),'existing');assert.equal(fs.existsSync(path.join(target,'.codex/AGENTS.md')),false);});
test('symlinked host directory is refused before writes',t=>{const target=fixture(t),outside=fixture(t);fs.symlinkSync(outside,path.join(target,'.codex'));assert.throws(()=>install(bundle(),target,globalOptions),/symlink/);assert.equal(fs.readdirSync(outside).length,0);assert.equal(fs.existsSync(path.join(target,'.mnx-agi')),false);});
test('symlinked backup destination is refused before writes',t=>{const target=fixture(t),outside=fixture(t);fs.mkdirSync(path.join(target,'.mnx-agi'));fs.symlinkSync(outside,path.join(target,'.mnx-agi/backups'));assert.throws(()=>install(bundle(),target,globalOptions),/symlink/);assert.equal(fs.existsSync(path.join(target,'.codex')),false);});
test('Codex global override is reported and prevents shadowed installation',t=>{const target=fixture(t);write(target,'.codex/AGENTS.override.md','override');assert.throws(()=>install(bundle(),target,globalOptions),/shadows/);});
test('project scaffolds preserve custom local configuration across upgrades',t=>{const target=fixture(t);install(bundle(),target);write(target,'.realm/policy.md','Custom policy');install(bundle('1.1.0'),target);assert.equal(read(target,'.realm/policy.md'),'Custom policy');assert.equal(verify(target,'project').ok,true);});
test('removed managed files are deleted only when unchanged and recoverable',t=>{const target=fixture(t),first=bundle();first.files.set('obsolete.txt',Buffer.from('old'));install(first,target,globalOptions);install(bundle('1.1.0'),target,globalOptions);assert.equal(fs.existsSync(path.join(target,'.mnx-agi/package/obsolete.txt')),false);rollback(target,'global');assert.equal(read(target,'.mnx-agi/package/obsolete.txt'),'old');});
test('missing managed file blocks upgrade rather than concealing drift',t=>{const target=fixture(t);install(bundle(),target,globalOptions);fs.unlinkSync(path.join(target,'.mnx-agi/package/constitution/CORE.md'));assert.throws(()=>install(bundle('1.1.0'),target,globalOptions),/removed/);});
test('malformed managed markers fail closed',t=>{const target=fixture(t);write(target,'.codex/AGENTS.md','<!-- MNX-AGI:BEGIN -->');assert.throws(()=>install(bundle(),target,globalOptions),/Malformed/);});
test('installation scope and host selection cannot change silently',t=>{const target=fixture(t);install(bundle(),target,globalOptions);assert.throws(()=>install(bundle(),target),/incompatible/);assert.throws(()=>install(bundle(),target,{scope:'global',hosts:['codex']}),/Host set/);});
test('pending partial installation blocks new writes and permits rollback',t=>{const target=fixture(t);const result=install(bundle(),target,globalOptions);write(target,'.mnx-agi/pending.json',JSON.stringify({snapshot:result.backup}));assert.equal(verify(target,'global').ok,false);assert.throws(()=>install(bundle(),target,globalOptions),/Interrupted/);rollback(target,'global');assert.equal(fs.existsSync(path.join(target,'.codex/AGENTS.md')),false);});
test('rollback metadata cannot target arbitrary files',t=>{const target=fixture(t);const result=install(bundle(),target,globalOptions);const snap=JSON.parse(read(target,result.backup));snap.changes[0].path='private.txt';write(target,result.backup,JSON.stringify(snap));assert.throws(()=>rollback(target,'global'),/Invalid rollback/);});
test('safe paths reject absolute paths, traversal and symlinks',t=>{const target=fixture(t);for(const name of ['/tmp/file','../outside','a/../b','a//b','a\\b']) assert.throws(()=>safePath(target,name));});
test('strict JSON rejects excessive nesting and escaped duplicate keys',()=>{assert.throws(()=>parseStrictJSON('['.repeat(130)+'0'+']'.repeat(130)),/nesting/);assert.throws(()=>parseStrictJSON('{"a":1,"\\u0061":2}'),/Duplicate/);});
test('release manifest detects tampering and unlisted files',t=>{const target=fixture(t);write(target,'package.json','{"version":"1.0.0"}');write(target,'release-manifest.json',JSON.stringify({schemaVersion:1,version:'1.0.0',files:[{path:'package.json',sha256:hash(Buffer.from('{"version":"1.0.0"}'))}]}));assert.equal(loadBundle(target).version,'1.0.0');write(target,'extra.txt','unexpected');assert.throws(()=>loadBundle(target),/inventory/);fs.unlinkSync(path.join(target,'extra.txt'));write(target,'package.json','{"version":"1.0.0", "extra":true}');assert.throws(()=>loadBundle(target),/drift/);});
test('release source symlinks are rejected',t=>{const target=fixture(t),other=fixture(t);write(other,'file','secret');fs.symlinkSync(path.join(other,'file'),path.join(target,'package.json'));assert.throws(()=>loadBundle(target),/symlink/);});
test('CLI rejects unknown options and invalid JSON without echoing payloads',t=>{const target=fixture(t);write(target,'bad.json','{"secret_payload_marker":');const run=(...args)=>spawnSync(process.execPath,[path.join(root,'bin/mnx-agi.mjs'),...args],{encoding:'utf8'});assert.equal(run('init','--unknown').status,1);const result=run('validate',path.join(target,'bad.json'));assert.equal(result.status,1);assert.equal(result.stderr.includes('secret_payload_marker'),false);});
