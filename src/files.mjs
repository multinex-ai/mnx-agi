import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export function exists(file) {
  try { fs.lstatSync(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}
export function relative(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes(':') ||
      !/^[a-zA-Z0-9_.\/-]+$/.test(value) || value.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Unsafe relative path');
  return value;
}
export function rootPath(input) {
  let root = path.resolve(input);
  const suffix = [];
  while (!exists(root)) { suffix.unshift(path.basename(root)); root = path.dirname(root); }
  root = fs.realpathSync(root);
  if (!fs.statSync(root).isDirectory()) throw new Error('Target must be a directory');
  return path.join(root, ...suffix);
}
export function safePath(root, name, directory = false) {
  const parts = relative(name).split('/');
  let current = root;
  if (exists(root) && (!fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink())) throw new Error('Unsafe target root');
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    if (!exists(current)) continue;
    const s = fs.lstatSync(current);
    if (s.isSymbolicLink()) throw new Error(`Refusing symlink: ${name}`);
    const wantDirectory = i < parts.length - 1 || directory;
    if (wantDirectory ? !s.isDirectory() : !s.isFile()) throw new Error(`Path collision: ${name}`);
  }
  return current;
}
export function walk(root, prefix = '', ignore = new Set()) {
  return fs.readdirSync(path.join(root, prefix), { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name)).flatMap(e => {
    if (ignore.has(e.name)) return [];
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    relative(rel);
    if (e.isSymbolicLink()) throw new Error(`Refusing source symlink: ${rel}`);
    if (e.isDirectory()) return walk(root, rel, ignore);
    if (!e.isFile()) throw new Error(`Unsupported file: ${rel}`);
    return [rel];
  });
}
export function atomicWrite(root, rel, content, mode = 0o600) {
  const file = safePath(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  safePath(root, rel);
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, content, { flag: 'wx', mode });
    fs.renameSync(temporary, file);
    fs.chmodSync(file, mode);
  } finally { if (exists(temporary)) fs.unlinkSync(temporary); }
}
export function utf8(bytes) { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
