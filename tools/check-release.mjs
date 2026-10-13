import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { walk } from '../src/files.mjs';
import { sourceIgnore } from '../src/bundle.mjs';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url))); 
const files = walk(root, '', sourceIgnore), errors = [];
const patterns = [new RegExp('/' + 'Users/[^/\\s]+/'), new RegExp('/' + 'home/[^/\\s]+/'), /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /gh[pousr]_[A-Za-z0-9]{30,}/, /github_pat_[A-Za-z0-9_]{40,}/, /\bAKIA[A-Z0-9]{16}\b/];
for (const name of files) {
  if (/^(?:\.env|\.realm|\.mnx-agi)(?:\/|$)/.test(name) || /\.(?:tgz|zip|pem|key)$/.test(name)) errors.push(`Forbidden release path: ${name}`);
  const text = fs.readFileSync(path.join(root, name), 'utf8');
  if (patterns.some(p => p.test(text))) errors.push(`Potential sensitive content: ${name}`);
  if (!name.endsWith('.md')) continue;
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^https?:\/\//.test(target)) continue;
    const resolved = path.resolve(root, path.dirname(name), target);
    if (!resolved.startsWith(root + path.sep) || !fs.existsSync(resolved)) errors.push(`Broken local link: ${name}`);
    if (name.startsWith('skills/') && !resolved.startsWith(path.join(root, ...name.split('/').slice(0, 2)) + path.sep)) errors.push(`Non-self-contained skill: ${name}`);
  }
  if (name.endsWith('/SKILL.md')) {
    const folder = name.split('/')[1];
    if (!text.startsWith(`---\nname: ${folder}\ndescription: `) || !/^mnx-[a-z-]+$/.test(folder)) errors.push(`Invalid skill metadata: ${name}`);
  }
}
// Copied references must stay byte-identical to their maintained source.
const references = { 'MEMORY_WORKFLOWS.md': 'docs/MEMORY_WORKFLOWS.md', 'CORE.md': 'constitution/CORE.md', 'ARCHITECTURE.md': 'docs/ARCHITECTURE.md', 'MEMQ_CONTRACT.md': 'docs/MEMQ_CONTRACT.md', 'RESEARCH.md': 'docs/RESEARCH.md', 'ACCEPTANCE.md': 'docs/ACCEPTANCE.md' };
for (const name of files.filter(n => n.startsWith('skills/') && n.includes('/references/'))) {
  const source = references[path.basename(name)];
  if (!source || !fs.readFileSync(path.join(root, name)).equals(fs.readFileSync(path.join(root, source)))) errors.push(`Stale skill reference: ${name}`);
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Release checks passed: ${files.length} files; links, skill references and common sensitive patterns. Manual disclosure review remains required.`);
