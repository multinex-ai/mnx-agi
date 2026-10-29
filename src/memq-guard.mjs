import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { unwrapMemq } from './codex-memq-client.mjs';

const fail = code => { throw new Error(code); };
const within = (root, candidate) => candidate === root || candidate.startsWith(root + path.sep);

function repositoryOwner(directory) {
  let cursor = directory, hasGitMarker = false;
  while (true) {
    if (fs.existsSync(path.join(cursor, '.git'))) { hasGitMarker = true; break; }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: directory, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return fs.realpathSync(common);
  } catch {
    if (hasGitMarker) fail('git_ownership_unresolved');
    return null;
  }
}

export function verifyWorkspace(config, cwd) {
  const root = fs.realpathSync(config.workspace), actual = fs.realpathSync(cwd);
  if (!within(root, actual)) fail('workspace_not_allowed');
  const actualOwner = repositoryOwner(actual), expectedOwner = repositoryOwner(root);
  const candidates = [actual, root, actualOwner].filter(Boolean);
  for (const denied of config.deniedRoots) {
    const canonical = fs.existsSync(denied) ? fs.realpathSync(denied) : path.resolve(denied);
    if (candidates.some(candidate => within(canonical, candidate))) fail('workspace_denied');
  }
  if (actualOwner !== expectedOwner) fail('workspace_repository_mismatch');
  return actual;
}

// This guard enforces routed calls only. A trusted host must protect its config,
// code, OAuth client and transport, and remove alternative memory connections.
export function createMemqGuard({ config, call, cwd = process.cwd(), audit }) {
  config = structuredClone(config);
  if (!config.namespace?.startsWith('org:') || !/^[a-z0-9-]{8,80}-$/.test(config.planPrefix ?? '') ||
      !Array.isArray(config.deniedRoots) || !config.deniedRoots.length || typeof audit !== 'function') fail('invalid_guard_configuration');
  // A strict installation must pin a service-issued subject. A namespace, email
  // supplied by the caller, or a remembered browser login is not that subject.
  if (config.requirePrincipal === true && (typeof config.principal !== 'string' || !config.principal.trim())) fail('principal_binding_required');
  verifyWorkspace(config, cwd);
  async function identity() {
    verifyWorkspace(config, cwd);
    const value = unwrapMemq(await call('reunion', { include_status: false }));
    const access = value.access;
    if (access?.namespace !== config.namespace || access.namespace_scoped !== true || access.auth_source !== 'oauth_billing_manager') fail('identity_mismatch');
    if (config.requirePrincipal === true && access.authenticated_subject !== config.principal) fail('principal_mismatch');
    return { namespace: access.namespace, authenticated: true, principalVerified: config.requirePrincipal === true };
  }
  async function dispatch(tool, input, state) {
    const args = structuredClone(input);
    if (!['plan_read', 'plan_write'].includes(tool)) fail('tool_not_allowed');
    const allowed = tool === 'plan_read' ? ['plan_id'] : ['plan_id', 'expected_state_version', 'state_patch'];
    if (!args || Object.getPrototypeOf(args) !== Object.prototype || Object.keys(args).some(key => !allowed.includes(key))) fail('argument_not_allowed');
    if (typeof args.plan_id !== 'string' || !args.plan_id.startsWith(config.planPrefix) || !/^[a-zA-Z0-9-]{1,160}$/.test(args.plan_id)) fail('plan_scope_denied');
    if (tool === 'plan_write' && (!Number.isSafeInteger(args.expected_state_version) || args.expected_state_version < 0 ||
        !args.state_patch || Array.isArray(args.state_patch) || typeof args.state_patch !== 'object')) fail('conditional_write_required');
    if (Buffer.byteLength(JSON.stringify(args)) > 16384) fail('payload_too_large');
    await identity();
    await audit({ tool, phase: 'dispatching' }); // No memory contents or identifiers in audit.
    state.dispatched = true;
    const result = unwrapMemq(await call(tool === 'plan_read' ? 'plan_state_read' : 'plan_state_write', { ...args, namespace: config.namespace }));
    if (result.namespace !== config.namespace || result.plan_id !== args.plan_id) fail('response_scope_mismatch');
    await audit({ tool, phase: 'returned' });
    return result;
  }
  async function execute(tool, input) {
    const state = { dispatched: false };
    try { return await dispatch(tool, input, state); }
    catch (error) {
      try { await audit({ tool: ['plan_read', 'plan_write'].includes(tool) ? tool : 'unsupported', phase: state.dispatched ? 'outcome_unconfirmed' : 'denied' }); }
      catch { /* Preserve failure; never dispatch or retry because audit failed. */ }
      throw error;
    }
  }
  return { identity, execute };
}
