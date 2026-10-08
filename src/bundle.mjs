import fs from 'node:fs';
import path from 'node:path';
import { hash, walk, relative, safePath } from './files.mjs';
import { parseStrictJSON } from '../tools/validate-realm.mjs';

export const sourceIgnore = new Set(['.git', 'node_modules', 'dist', '.DS_Store']);
export function loadBundle(root) {
  const found = walk(root, '', sourceIgnore).filter(p => p !== 'release-manifest.json').sort();
  const raw = fs.readFileSync(path.join(root, 'release-manifest.json'));
  const manifest = parseStrictJSON(raw.toString('utf8'));
  const pkg = parseStrictJSON(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.version !== pkg.version || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error('Invalid release manifest');
  const files = new Map();
  for (const entry of manifest.files) {
    relative(entry.path);
    if (files.has(entry.path) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid manifest entry');
    const bytes = fs.readFileSync(safePath(root, entry.path));
    if (hash(bytes) !== entry.sha256) throw new Error(`Package drift: ${entry.path}`);
    files.set(entry.path, bytes);
  }
  if (JSON.stringify(found) !== JSON.stringify([...files.keys()].sort())) throw new Error('Package inventory differs from manifest');
  files.set('release-manifest.json', raw);
  return { root, version: manifest.version, digest: hash(raw), files };
}
