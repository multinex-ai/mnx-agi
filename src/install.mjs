import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicWrite, exists, hash, relative, rootPath, safePath, utf8 } from './files.mjs';
import { parseStrictJSON } from '../tools/validate-realm.mjs';

const stateName = '.mnx-agi/install.json';
const pendingName = '.mnx-agi/pending.json';
const begin = '<!-- MNX-AGI:BEGIN -->';
const end = '<!-- MNX-AGI:END -->';
const read = (root, name) => { const f = safePath(root, name); return exists(f) ? fs.readFileSync(f) : null; };
const digest = bytes => bytes === null ? null : hash(bytes);
const json = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";

function blockParts(bytes) {
  const text = utf8(bytes ?? Buffer.alloc(0));
  const starts = text.split(begin).length - 1;
  const ends = text.split(end).length - 1;
  if (starts !== ends || starts > 1 || (starts && text.indexOf(end) < text.indexOf(begin))) throw new Error('Malformed managed instruction block');
  if (!starts) return { prefix: text, block: null, suffix: '' };
  const from = text.indexOf(begin), to = text.indexOf(end) + end.length;
  return { prefix: text.slice(0, from), block: text.slice(from, to), suffix: text.slice(to) };
}
function allowed(name, scope) {
  relative(name);
  if (name.startsWith('.mnx-agi/package/') || name === stateName) return true;
  if (/^\.agents\/skills\/mnx-[a-z-]+\//.test(name)) return true;
  if (scope === 'global') return name === '.local/bin/mnx-agi' || name === '.codex/AGENTS.md' || name === '.claude/CLAUDE.md' || /^\.claude\/skills\/mnx-[a-z-]+\//.test(name);
  return ['AGENTS.md', '.realm/realm.json', '.realm/policy.md'].includes(name);
}
function checkState(state, scope) {
  if (state.schemaVersion !== 1 || state.scope !== scope || !Array.isArray(state.files)) throw new Error('Invalid or incompatible installation state');
  const names = new Set();
  for (const f of state.files) {
    if (!allowed(f.path, scope) || names.has(f.path) || !['managed', 'block', 'scaffold'].includes(f.kind) || !/^[a-f0-9]{64}$/.test(f.hash)) throw new Error('Invalid installation file record');
    names.add(f.path);
  }
  return state;
}
function prior(root, scope) {
  const bytes = read(root, stateName);
  return bytes ? checkState(parseStrictJSON(utf8(bytes)), scope) : null;
}
function actualHash(root, file) {
  const bytes = read(root, file.path);
  if (file.kind === 'block') return digest(blockParts(bytes).block === null ? null : Buffer.from(blockParts(bytes).block));
  return digest(bytes);
}
export function verify(target, scope) {
  const root = rootPath(target), state = prior(root, scope);
  if (!state) return { ok: false, errors: ['No installation state'], runtimeVerified: false };
  const errors = [];
  if (read(root, pendingName)) errors.push('Interrupted installation: rollback before continuing');
  for (const f of state.files) {
    if (f.kind === 'scaffold') continue;
    try { if (actualHash(root, f) !== f.hash) errors.push(`Installation drift: ${f.path}`); }
    catch { errors.push(`Unsafe or malformed installation file: ${f.path}`); }
  }
  if (scope === 'global' && state.hosts.includes('codex') && exists(path.join(root, '.codex/AGENTS.override.md'))) errors.push('Codex AGENTS.override.md shadows the installed global AGENTS.md');
  return { ok: !errors.length, version: state.version, scope, errors, runtimeVerified: false };
}
export function install(bundle, target, { scope = 'project', hosts = ['codex'], dryRun = false } = {}) {
  if (!['project', 'global'].includes(scope) || !hosts.length || hosts.some(h => !['codex','claude'].includes(h)) || new Set(hosts).size !== hosts.length) throw new Error('Invalid scope or hosts');
  if (scope === 'project' && (hosts.length !== 1 || hosts[0] !== 'codex')) throw new Error('Project installation supports the AGENTS.md host; use global for Claude');
  const root = rootPath(target);
  if (read(root, pendingName)) throw new Error('Interrupted installation: run rollback');
  const old = prior(root, scope);
  if (old && JSON.stringify(old.hosts) !== JSON.stringify(hosts)) throw new Error('Host set differs from installation; rollback before changing hosts');
  if (scope === 'global' && hosts.includes('codex') && exists(path.join(root, '.codex/AGENTS.override.md'))) throw new Error('Codex AGENTS.override.md shadows AGENTS.md; reconcile it before installing');
  const desired = new Map();
  const add = (name, bytes, kind = 'managed', mode = 0o600) => desired.set(name, { bytes: Buffer.from(bytes), kind, mode });
  for (const [name, bytes] of bundle.files) add(`.mnx-agi/package/${name}`, bytes);
  const hostFiles = scope === 'global' ? hosts.map(h => h === 'codex' ? '.codex/AGENTS.md' : '.claude/CLAUDE.md') : ['AGENTS.md'];
  const body = `${begin}\n${utf8(bundle.files.get('constitution/CORE.md'))}\nLocal project and account-routing instructions remain applicable. Resolve task ownership before private memory access, including explicit project targets and linked worktrees. Read the adopted realm policy when present. A local declaration never proves remote authorization.\n${end}`;
  for (const name of hostFiles) add(name, body, 'block');
  const skillRoots = scope === 'global' ? hosts.map(h => h === 'codex' ? '.agents/skills' : '.claude/skills') : ['.agents/skills'];
  for (const [name, bytes] of bundle.files) if (name.startsWith('skills/')) for (const skillRoot of skillRoots) add(`${skillRoot}/${name.slice(7)}`, bytes);
  if (scope === 'global') {
    add('.local/bin/mnx-agi', `#!/bin/sh\nexec node ${quote(path.join(root, '.mnx-agi/package/bin/mnx-agi.mjs'))} "$@"\n`, 'managed', 0o700);
  } else {
    add('.realm/realm.json', bundle.files.get('examples/local.realm.json'), 'scaffold');
    add('.realm/policy.md', '# Local realm policy\n\nApply the adopted MNX-AGI core and existing project instructions.\nThis local-only realm does not grant remote memory or federation access.\n', 'scaffold');
  }
  const oldFiles = new Map((old?.files ?? []).map(f => [f.path, f]));
  const changes = [], records = [];
  for (const [name, item] of desired) {
    const before = read(root, name), previous = oldFiles.get(name);
    let after = item.bytes, ownedHash = hash(after);
    if (item.kind === 'scaffold' && before !== null) { after = before; ownedHash = hash(before); }
    else if (item.kind === 'block') {
      const parts = blockParts(before);
      if (parts.block !== null && hash(parts.block) !== ownedHash && (!previous || previous.hash !== hash(parts.block))) throw new Error(`Managed block conflict: ${name}`);
      if (previous && parts.block === null) throw new Error(`Managed block removed: ${name}`);
      const separator = parts.block === null && parts.prefix && !parts.prefix.endsWith('\n\n') ? (parts.prefix.endsWith('\n') ? '\n' : '\n\n') : '';
      after = Buffer.from(parts.prefix + separator + utf8(item.bytes) + (parts.block === null ? '\n' : parts.suffix));
      if (after.length > 30000) throw new Error(`Instruction file would exceed the supported size budget: ${name}`);
    } else if (before !== null && hash(before) !== ownedHash && (!previous || hash(before) !== previous.hash)) throw new Error(`File conflict: ${name}`);
    else if (before === null && previous) throw new Error(`Managed file removed: ${name}`);
    records.push({ path: name, kind: item.kind, hash: ownedHash });
    if (digest(before) !== digest(after)) changes.push({ path: name, before, after, mode: before ? fs.statSync(safePath(root, name)).mode & 0o777 : item.mode });
  }
  for (const previous of old?.files ?? []) if (!desired.has(previous.path)) {
    if (previous.kind !== 'managed') throw new Error('Upgrade cannot remove an instruction block or local policy automatically');
    const before = read(root, previous.path);
    if (digest(before) !== previous.hash) throw new Error(`Removed-file conflict: ${previous.path}`);
    changes.push({ path: previous.path, before, after: null, mode: fs.statSync(safePath(root, previous.path)).mode & 0o777 });
  }
  const state = { schemaVersion: 1, scope, hosts, version: bundle.version, manifestDigest: bundle.digest, files: records };
  const beforeState = read(root, stateName), afterState = json(state);
  if (digest(beforeState) !== hash(afterState)) changes.push({ path: stateName, before: beforeState, after: afterState, mode: 0o600 });
  // Preflight *all* destinations and recovery paths before the first write.
  for (const c of changes) safePath(root, c.path);
  safePath(root, '.mnx-agi/backups', true);
  safePath(root, pendingName);
  safePath(root, '.mnx-agi/last-backup.json');
  const result = { ok: true, dryRun, scope, version: bundle.version, changed: changes.map(c => c.path), runtimeVerified: false };
  if (dryRun || !changes.length) return result;
  const id = crypto.randomUUID();
  const snapshot = { schemaVersion: 1, scope, changes: changes.map(c => ({ path: c.path, before: c.before?.toString('base64') ?? null, afterHash: digest(c.after), mode: c.mode })) };
  const snapshotName = `.mnx-agi/backups/${id}.json`;
  atomicWrite(root, snapshotName, json(snapshot));
  atomicWrite(root, pendingName, json({ snapshot: snapshotName }));
  for (const c of changes) {
    // Refuse an edit made since planning, including changed host instructions.
    if (digest(read(root, c.path)) !== digest(c.before)) throw new Error(`Concurrent edit: ${c.path}; run rollback`);
    if (c.after === null) fs.unlinkSync(safePath(root, c.path));
    else atomicWrite(root, c.path, c.after, c.mode);
  }
  atomicWrite(root, '.mnx-agi/last-backup.json', json({ snapshot: snapshotName }));
  fs.unlinkSync(safePath(root, pendingName));
  return { ...result, backup: snapshotName };
}
export function rollback(target, scope, dryRun = false) {
  const root = rootPath(target);
  const pointer = read(root, pendingName) ?? read(root, '.mnx-agi/last-backup.json');
  if (!pointer) throw new Error('No rollback snapshot');
  const { snapshot: name } = parseStrictJSON(utf8(pointer));
  if (typeof name !== 'string' || !/^\.mnx-agi\/backups\/[a-f0-9-]{36}\.json$/.test(name)) throw new Error('Invalid rollback pointer');
  const snapshot = parseStrictJSON(utf8(read(root, name)));
  if (snapshot.schemaVersion !== 1 || snapshot.scope !== scope || !Array.isArray(snapshot.changes)) throw new Error('Invalid rollback snapshot');
  const names = new Set();
  const changes = snapshot.changes.map(c => {
    if (!allowed(c.path, scope) || names.has(c.path) || !Number.isInteger(c.mode) || c.mode < 0 || c.mode > 0o777 || !(c.afterHash === null || /^[a-f0-9]{64}$/.test(c.afterHash)) || !(c.before === null || typeof c.before === 'string')) throw new Error('Invalid rollback entry');
    names.add(c.path);
    const before = c.before === null ? null : Buffer.from(c.before, 'base64');
    const current = read(root, c.path);
    if (digest(current) !== c.afterHash && digest(current) !== digest(before)) throw new Error(`Rollback would overwrite newer work: ${c.path}`);
    return { ...c, before, current };
  });
  if (!dryRun) {
    for (const c of changes.reverse()) {
      if (digest(read(root, c.path)) !== digest(c.current)) throw new Error('Concurrent edit during rollback');
      if (c.before === null) { if (read(root, c.path) !== null) fs.unlinkSync(safePath(root, c.path)); }
      else atomicWrite(root, c.path, c.before, c.mode);
    }
    for (const pointerName of [pendingName, '.mnx-agi/last-backup.json']) if (read(root, pointerName)) fs.unlinkSync(safePath(root, pointerName));
  }
  return { ok: true, dryRun, restored: changes.length, runtimeVerified: false };
}
