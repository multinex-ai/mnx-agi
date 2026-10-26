import { canonicalJson, contentDigest, verifyGenesis } from './genesis.mjs';
import { Buffer } from 'node:buffer';

const fail = code => { throw Object.assign(new Error(code), { code }); };
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 4096;
const sameScope = (a, b) => ['service', 'principal', 'namespace', 'realm'].every(k => text(a?.[k]) && a[k] === b?.[k]);

/** Opt-in, single-pending-action pilot. Store/authorization/evaluator are host-owned adapters.
 * No agent is launched, no provider is selected, and no production mutation is implicit.
 */
export function createCognitiveSession({ binding, signedGenesis, expectedGenesis, trust, store, authorize, verifyOutcome, evaluate, execute, environment }) {
  if (!sameScope(binding, binding) || store?.capabilities?.compareAndSwap !== true ||
      !['read', 'compareAndSwap'].every(k => typeof store[k] === 'function') ||
      [trust, authorize, verifyOutcome, evaluate, execute, environment].some(fn => typeof fn !== 'function')) fail('invalid_cognitive_adapters');
  const scope = structuredClone(binding), signed = structuredClone(signedGenesis), expected = structuredClone(expectedGenesis);
  async function gate(operation) {
    const current = await trust();
    const genesis = verifyGenesis({ signed, expected, ...current });
    if (genesis.realm !== scope.realm) fail('genesis_scope_mismatch');
    const decision = await authorize({ operation, binding: structuredClone(scope), genesisDigest: genesis.genesisDigest });
    if (decision?.allowed !== true || !text(decision.policyRevision) || !Number.isFinite(decision.expiresAt) || decision.expiresAt <= Date.now()) fail('cognitive_operation_denied');
    return { genesis, expiresAt: decision.expiresAt };
  }
  async function read(operation) {
    const { genesis, expiresAt } = await gate(operation);
    const row = await store.read();
    if (row === null) return { version: 0, expiresAt, state: { schemaVersion: 1, binding: scope, genesisDigest: genesis.genesisDigest, experiences: [], skills: [], operations: [], pending: null } };
    const s = row.state;
    if (!Number.isSafeInteger(row.version) || row.version < 1 || !s || s.schemaVersion !== 1 || !sameScope(s.binding, scope) ||
        s.genesisDigest !== genesis.genesisDigest || !['experiences', 'skills', 'operations'].every(k => Array.isArray(s[k])) ||
        Buffer.byteLength(canonicalJson(s)) > 131072) fail('invalid_cognitive_state');
    for (const skill of s.skills) if (!skill || contentDigest(skill.manifest) !== skill.digest || !['candidate', 'active'].includes(skill.status) || !Array.isArray(skill.trials)) fail('invalid_skill_state');
    return { version: row.version, state: structuredClone(s), expiresAt };
  }
  async function commit(row) {
    if (Buffer.byteLength(canonicalJson(row.state)) > 131072 || row.state.operations.length > 1000 || row.state.experiences.length > 1000) fail('cognitive_capacity_reached');
    if (row.expiresAt <= Date.now()) fail('cognitive_authorization_expired');
    const receipt = await store.compareAndSwap(row.version, structuredClone(row.state));
    if (receipt?.version !== row.version + 1) fail('cognitive_write_outcome_unconfirmed');
    return receipt.version;
  }
  function idle(row) { if (row.state.pending !== null) fail('cognitive_action_requires_reconciliation'); }
  async function snapshot() { return structuredClone((await read('read')).state); }
  async function observe(input) {
    if (!input || !text(input.id) || !text(input.text) || !input.metadata || typeof input.metadata !== 'object' || Array.isArray(input.metadata) ||
        Object.keys(input).sort().join() !== 'id,metadata,text') fail('invalid_experience');
    const record = structuredClone(input), digest = contentDigest(record);
    const row = await read('observe'); idle(row);
    const previous = row.state.experiences.find(e => e.record.id === record.id);
    if (previous) { if (previous.digest !== digest) fail('experience_conflict'); return structuredClone(previous.outcome); }
    const outcome = await verifyOutcome(record, scope.namespace);
    if (!outcome || typeof outcome.verified !== 'boolean' || !['observe', 'reinforce', 'avoid'].includes(outcome.reward) ||
        (outcome.verified && !text(outcome.sourceEventId)) || (!outcome.verified && outcome.reward !== 'observe')) fail('invalid_outcome_receipt');
    row.state.experiences.push({ record, digest, outcome });
    await gate('observe'); await commit(row); return structuredClone(outcome);
  }
  async function proposeSkill(manifest) {
    if (!manifest || Object.keys(manifest).sort().join() !== 'environment,id,procedure' || !text(manifest.id) || !text(manifest.environment)) fail('invalid_skill_manifest');
    const copy = structuredClone(manifest), digest = contentDigest(copy);
    const row = await read('propose'); idle(row);
    const old = row.state.skills.find(s => s.manifest.id === copy.id);
    if (old) { if (old.digest !== digest) fail('skill_revision_conflict'); return digest; }
    row.state.skills.push({ manifest: copy, digest, status: 'candidate', trials: [] });
    await commit(row); return digest;
  }
  async function run(kind, skillId, task, operationId) {
    if (!text(skillId) || !text(operationId)) fail('invalid_cognitive_action');
    const copy = structuredClone(task), inputDigest = contentDigest({ kind, skillId, task: copy });
    let row = await read(kind);
    const completed = row.state.operations.find(o => o.id === operationId);
    if (completed) { if (completed.inputDigest !== inputDigest) fail('operation_conflict'); return structuredClone(completed.result); }
    idle(row);
    const skill = row.state.skills.find(s => s.manifest.id === skillId);
    if (!skill || (kind === 'execute' && skill.status !== 'active')) fail('skill_not_available');
    row.state.pending = { id: operationId, inputDigest, kind, skillDigest: skill.digest };
    await commit(row);
    // The durable reservation precedes all external work. Ambiguity is never retried here.
    let result;
    try {
      await gate(kind);
      const activeEnvironment = await environment();
      if (activeEnvironment?.id !== skill.manifest.environment || !text(activeEnvironment.revision)) fail('skill_environment_mismatch');
      // Recheck after asynchronous environment discovery, immediately before dispatch.
      await gate(kind);
      result = await (kind === 'evaluate' ? evaluate : execute)({ skill: structuredClone(skill.manifest), task: copy, operationId,
        binding: structuredClone(scope), environment: structuredClone(activeEnvironment) });
      canonicalJson(result);
      if (kind === 'evaluate' && (!result || typeof result.passed !== 'boolean' || !text(result.sourceEventId) ||
          !['practice', 'held_out'].includes(result.split) || !text(result.evidenceRef))) fail('invalid_evaluation_receipt');
      row = await read(kind);
      if (row.state.pending?.id !== operationId || row.state.pending?.inputDigest !== inputDigest) fail('action_reservation_changed');
      const current = row.state.skills.find(s => s.digest === skill.digest);
      if (!current) fail('skill_revision_changed');
      if (kind === 'evaluate') current.trials.push({ ...result, operationId });
      row.state.operations.push({ id: operationId, inputDigest, result }); row.state.pending = null;
      await commit(row);
    } catch { fail('cognitive_action_outcome_unconfirmed'); }
    return structuredClone(result);
  }
  async function activateSkill(skillId) {
    const row = await read('activate'); idle(row);
    const skill = row.state.skills.find(s => s.manifest.id === skillId);
    if (skill?.status === 'active') return skill.digest;
    const passed = skill?.trials.filter(t => t.passed) ?? [];
    const practiceSources = new Set(passed.filter(t => t.split === 'practice').map(t => t.sourceEventId));
    const independentHeldOut = passed.some(t => t.split === 'held_out' && !practiceSources.has(t.sourceEventId));
    if (!skill || !passed.some(t => t.split === 'practice') || !passed.some(t => t.split === 'held_out') ||
        !independentHeldOut || new Set(passed.map(t => t.sourceEventId)).size < 2 || skill.trials.some(t => !t.passed)) fail('skill_evidence_insufficient');
    skill.status = 'active'; await commit(row); return skill.digest;
  }
  return Object.freeze({ snapshot, observe, proposeSkill, activateSkill,
    evaluateSkill: (id, task, operationId) => run('evaluate', id, task, operationId),
    executeSkill: (id, task, operationId) => run('execute', id, task, operationId) });
}
