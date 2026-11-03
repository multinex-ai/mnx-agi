#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBundle } from '../src/bundle.mjs';
import { install, verify, rollback } from '../src/install.mjs';
import { rootPath, safePath } from '../src/files.mjs';
import { parseStrictJSON, validateRealm } from '../tools/validate-realm.mjs';
import { evaluateRuns } from '../src/evaluate.mjs';
import { planMemory } from '../src/memory-plan.mjs';
import { preferences } from '../src/accord.mjs';
const source = fileURLToPath(new URL('..', import.meta.url));
try {
  const args = process.argv.slice(2), command = args.shift();
  if (!command || command === 'help' || command === '--help') {
    console.log('MNX-AGI: setup [--config FILE] [--accept-accord] [--replace-configuration] [--global] [--dir PATH] [--hosts codex,claude] [--dry-run]\nMNX-AGI: init | upgrade | verify | doctor | rollback [--global] [--dir PATH] [--hosts codex,claude] [--dry-run]\nMNX-AGI: validate REALM.json | memory-plan INPUT.json | evaluate RUNS.json | verify-package\nNode.js 22+. No remote services are contacted. Backups and Accord configuration are private; never publish them.');
  } else if (command === 'verify-package') {
    if (args.length) throw new Error('Unexpected argument');
    const b = loadBundle(source); console.log(JSON.stringify({ ok: true, version: b.version, files: b.files.size, manifestDigest: b.digest, runtimeVerified: false }, null, 2));
  } else if (command === 'validate' || command === 'memory-plan' || command === 'evaluate') {
    if (args.length !== 1) throw new Error('Expected one JSON path');
    const file = path.resolve(args[0]);
    const value = parseStrictJSON(fs.readFileSync(safePath(rootPath(path.dirname(file)), path.basename(file)), 'utf8'));
    const result = command === 'memory-plan' ? planMemory(value) : command === 'evaluate' ? evaluateRuns(value) : validateRealm(value); console.log(JSON.stringify(result, null, 2)); if (result.ok === false) process.exitCode = 1;
  } else {
    if (!['setup','init','upgrade','verify','doctor','rollback'].includes(command)) throw new Error('Unknown command');
    let scope = 'project', directory, hosts, configFile, dryRun = false, acceptAccord = false, replaceConfiguration = false;
    const seen = new Set();
    while (args.length) {
      const arg = args.shift();
      if (seen.has(arg)) throw new Error('Duplicate option'); seen.add(arg);
      if (arg === '--global') scope = 'global';
      else if (arg === '--dry-run') dryRun = true;
      else if (arg === '--accept-accord') acceptAccord = true;
      else if (arg === '--replace-configuration') replaceConfiguration = true;
      else if (arg === '--dir' || arg === '--hosts' || arg === '--config') { const value = args.shift(); if (!value || value.startsWith('--')) throw new Error('Missing option value'); if (arg === '--dir') directory = value; else if (arg === '--config') configFile = value; else hosts = value.split(','); }
      else throw new Error('Unknown option');
    }
    if (['verify','doctor','rollback'].includes(command) && hosts) throw new Error('--hosts is only for installation');
    if (['verify','doctor'].includes(command) && dryRun) throw new Error('--dry-run is only for installation or rollback');
    if (command !== 'setup' && (configFile || acceptAccord || replaceConfiguration)) throw new Error('Accord configuration options require setup');
    if (replaceConfiguration && !acceptAccord) throw new Error('--replace-configuration requires --accept-accord');
    let configuration;
    if (configFile) {
      const file = path.resolve(configFile), safe = safePath(rootPath(path.dirname(file)), path.basename(file));
      if (fs.statSync(safe).size > 16384) throw new Error('Accord preferences exceed supported size');
      configuration = preferences(parseStrictJSON(fs.readFileSync(safe, 'utf8')));
    }
    const target = directory ?? (scope === 'global' ? os.homedir() : process.cwd());
    let result;
    if (command === 'rollback') result = rollback(target, scope, dryRun);
    else if (command === 'verify' || command === 'doctor') {
      result = verify(target, scope);
      if (command === 'doctor') result = { ...result, node: process.version, memory: 'Not probed; identity and namespace verification required before private access', enforcement: 'Local integrity only; separately installed brokers, sandboxes and remote ACLs are not inspected' };
    } else {
      result = install(loadBundle(source), target, { scope, hosts, dryRun: dryRun || (command === 'setup' && !acceptAccord), configuration, acceptAccord, replaceConfiguration });
      if (command === 'setup') result.needsAcceptance = !acceptAccord;
    }
    console.log(JSON.stringify(result, null, 2)); if (!result.ok) process.exitCode = 1;
  }
} catch (error) {
  // Parser errors may include private input fragments; suppress their payload.
  console.error(error instanceof SyntaxError ? 'Invalid JSON input' : error.message);
  process.exitCode = 1;
}
