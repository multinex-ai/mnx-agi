import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const sources = { 'RUNTIME.md': 'docs/RUNTIME.md', 'MEMORY_WORKFLOWS.md': 'docs/MEMORY_WORKFLOWS.md', 'CORE.md': 'constitution/CORE.md', 'ARCHITECTURE.md': 'docs/ARCHITECTURE.md', 'MEMQ_CONTRACT.md': 'docs/MEMQ_CONTRACT.md', 'RESEARCH.md': 'docs/RESEARCH.md', 'ACCEPTANCE.md': 'docs/ACCEPTANCE.md' };
for (const name of fs.readdirSync(path.join(root, 'skills'))) {
  const dir = path.join(root, 'skills', name), entry = path.join(dir, 'SKILL.md');
  let text = fs.readFileSync(entry, 'utf8');
  text = text.replaceAll('../../docs/', 'references/').replaceAll('../../constitution/', 'references/');
  fs.writeFileSync(entry, text);
  const needed = new Set([...text.matchAll(/\]\(references\/([A-Z_]+\.md)\)/g)].map(m => m[1]));
  fs.mkdirSync(path.join(dir, 'references'), { recursive: true });
  for (const existing of fs.readdirSync(path.join(dir, 'references'))) if (!needed.has(existing)) fs.unlinkSync(path.join(dir, 'references', existing));
  for (const file of needed) {
    if (!sources[file]) throw new Error('Unknown skill reference');
    fs.copyFileSync(path.join(root, sources[file]), path.join(dir, 'references', file));
  }
}
