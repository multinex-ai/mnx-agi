import { hash, utf8 } from './files.mjs';
import { parseStrictJSON } from '../tools/validate-realm.mjs';

export const accordPath = '.mnx-agi/accord.json';
const fail = () => { throw new Error('Invalid private Accord configuration; review the documented fields without including credentials'); };
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
function keys(x, allowed, required = allowed) {
  if (!object(x) || Object.keys(x).some(k => !allowed.includes(k)) || required.some(k => !Object.hasOwn(x, k))) fail();
}
const ref = x => typeof x === 'string' && /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,127}$/.test(x);
export function preferences(input = {}) {
  keys(input, ['profile', 'stack', 'memory', 'excludedProjectRefs'], []);
  const profile = Object.hasOwn(input, 'profile') ? input.profile : 'portable', stack = Object.hasOwn(input, 'stack') ? input.stack : 'project';
  if (!['portable', 'multinex'].includes(profile) || !['project', 'rust-typescript'].includes(stack)) fail();
  const memory = Object.hasOwn(input, 'memory') ? input.memory : { adapter: 'local', mode: 'local', onUnavailable: 'local-only' };
  keys(memory, ['adapter', 'mode', 'onUnavailable', 'connectionRef', 'identityRef', 'expectedNamespace'], ['adapter', 'mode', 'onUnavailable']);
  if (!['local', 'memq'].includes(memory.adapter) || !['local', 'preferred', 'required'].includes(memory.mode) || !['local-only', 'pause-dependent'].includes(memory.onUnavailable)) fail();
  if (memory.adapter === 'local') {
    if (memory.mode !== 'local' || ['connectionRef', 'identityRef', 'expectedNamespace'].some(k => Object.hasOwn(memory, k))) fail();
  } else if (memory.mode === 'local' || !['connectionRef', 'identityRef', 'expectedNamespace'].every(k => ref(memory[k])) || (memory.mode === 'required' && memory.onUnavailable !== 'pause-dependent')) fail();
  const excludedProjectRefs = Object.hasOwn(input, 'excludedProjectRefs') ? input.excludedProjectRefs : [];
  if (!Array.isArray(excludedProjectRefs) || excludedProjectRefs.length > 64 || excludedProjectRefs.some(x => !ref(x)) || new Set(excludedProjectRefs).size !== excludedProjectRefs.length) fail();
  return { profile, stack, memory: { adapter: memory.adapter, mode: memory.mode, onUnavailable: memory.onUnavailable, ...(memory.adapter === 'memq' ? { connectionRef: memory.connectionRef, identityRef: memory.identityRef, expectedNamespace: memory.expectedNamespace } : {}) }, excludedProjectRefs };
}
export function makeAccord(core, { scope, hosts, configuration, accepted = false, now = new Date().toISOString() }) {
  return { schemaVersion: 1, scope, hosts, preferences: preferences(configuration), adoption: { state: accepted ? 'accepted' : 'pending', coreDigest: hash(core), acceptedAt: accepted ? now : null } };
}
export function parseAccord(bytes) {
  if (bytes.length > 16384) fail();
  const value = parseStrictJSON(utf8(bytes));
  keys(value, ['schemaVersion', 'scope', 'hosts', 'preferences', 'adoption']);
  if (value.schemaVersion !== 1 || !['project', 'global'].includes(value.scope) || !Array.isArray(value.hosts) || !value.hosts.length || value.hosts.some(h => !['codex', 'claude'].includes(h)) || new Set(value.hosts).size !== value.hosts.length || (value.scope === 'project' && JSON.stringify(value.hosts) !== '["codex"]')) fail();
  value.preferences = preferences(value.preferences);
  keys(value.adoption, ['state', 'coreDigest', 'acceptedAt']);
  const a = value.adoption;
  if (!['pending', 'accepted'].includes(a.state) || typeof a.coreDigest !== 'string' || !/^[a-f0-9]{64}$/.test(a.coreDigest) || (a.state === 'pending' ? a.acceptedAt !== null : typeof a.acceptedAt !== 'string' || !Number.isFinite(Date.parse(a.acceptedAt)) || new Date(a.acceptedAt).toISOString() !== a.acceptedAt)) fail();
  return value;
}
export function inspectAccord(bytes, core, scope, hosts) {
  if (bytes === null) return { state: 'not-configured', memoryVerified: false, enforcementVerified: false };
  const value = parseAccord(bytes);
  if (value.scope !== scope || JSON.stringify(value.hosts) !== JSON.stringify(hosts)) fail();
  return { state: value.adoption.coreDigest !== hash(core) ? 'review-required' : value.adoption.state, profile: value.preferences.profile, memoryAdapter: value.preferences.memory.adapter, memoryVerified: false, enforcementVerified: false };
}
