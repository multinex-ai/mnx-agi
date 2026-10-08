import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { walk, hash } from '../src/files.mjs';
import { sourceIgnore } from '../src/bundle.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const files = walk(root, '', sourceIgnore).filter(p => p !== 'release-manifest.json').sort().map(p => ({path:p, sha256:hash(fs.readFileSync(new URL(`../${p}`,import.meta.url)))}));
fs.writeFileSync(new URL('../release-manifest.json', import.meta.url), JSON.stringify({schemaVersion:1,version:pkg.version,files},null,2)+'\n');
console.log(`Manifest: ${files.length} files`);
