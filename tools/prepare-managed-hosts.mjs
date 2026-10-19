import fs from 'node:fs';
import path from 'node:path';
import { prepareManagedPolicies } from '../src/host-enforcement.mjs';
const [destination, brokerExecutable, ...extra] = process.argv.slice(2);
if (!destination || !brokerExecutable || extra.length) throw new Error('Usage: prepare-managed-hosts OUTPUT_DIRECTORY ROOT_CONTROLLED_BROKER_EXECUTABLE');
const bundle = prepareManagedPolicies({ brokerExecutable });
const output = path.resolve(destination);
// A new directory prevents accidental replacement of reviewed candidates.
fs.mkdirSync(output, { mode: 0o700 });
for (const file of bundle.files) fs.writeFileSync(path.join(output, `${file.name}.${file.name === 'codex' ? 'toml' : 'json'}`), file.content, { mode: 0o600, flag: 'wx' });
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(bundle, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ output, activated: false, files: bundle.files.map(({ destination, sha256 }) => ({ destination, sha256 })), systemSealed: false }, null, 2));
