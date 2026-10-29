import { verifyGenesis } from './genesis.mjs';
import { LIMITS, boundedJson, canonicalJson, contentDigest, validateContract, validateEvaluationPolicy, verifyEvaluationReceipt } from './cognitive-contracts.mjs';
import { Buffer } from 'node:buffer';

const fail = code => { throw Object.assign(new Error(code), { code }); };
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 256;
const sameScope = (a, b) => ['service', 'principal', 'namespace', 'realm'].every(k => text(a?.[k]) && a[k] === b?.[k]);
const unique = (items, key) => new Set(items.map(key)).size === items.length;
function qualified(skill) {
  const passed = skill.trials.map(t => t.receipt);
  const practice = new Set(passed.filter(t => t.split === 'practice').map(t => t.independentSourceGroup));
  const practiceEvents = new Set(passed.filter(t => t.split === 'practice').map(t => t.sourceEventId));
  // All trials must pass; a copied lineage is not an independent held-out group.
  return passed.length >= 2 && passed.every(t => t.passed) && practice.size > 0 &&
    passed.some(t => t.split === 'held_out' && !practice.has(t.independentSourceGroup) && !practiceEvents.has(t.sourceEventId));
}

/** Bounded, opt-in pilot. Adapters and evaluator signing roots belong to the host. */
export function createCognitiveSession({ binding, signedGenesis, expectedGenesis, trust, store, authorize, verifyOutcome, evaluate, execute, environment, evaluationPolicy = { trustedEvaluators: {} } }) {
  validateContract('binding', binding);
  if (store?.capabilities?.compareAndSwap !== true || !['read', 'compareAndSwap'].every(k => typeof store[k] === 'function') ||
      [trust, authorize, verifyOutcome, evaluate, execute, environment].some(fn => typeof fn !== 'function')) fail('invalid_cognitive_adapters');
  const scope = structuredClone(binding), signed = structuredClone(signedGenesis), expected = structuredClone(expectedGenesis);
  const evaluators = validateEvaluationPolicy(evaluationPolicy), bindingDigest = contentDigest(scope);
  async function gate(operation) {
    const current = await trust();
    if (!current || Object.keys(current).some(k => !['trustedKeys', 'revokedKeyIds', 'now'].includes(k))) fail('invalid_genesis_trust_provider');
    // Provider output is allowlisted and cannot replace the pinned signed/expected artifacts.
    const genesis = verifyGenesis({ ...current, signed, expected });
    if (genesis.realm !== scope.realm) fail('genesis_scope_mismatch');
    const decision = await authorize({ operation, binding: structuredClone(scope), genesisDigest: genesis.genesisDigest });
    if (decision?.allowed !== true || !text(decision.policyRevision) || !Number.isFinite(decision.expiresAt) || decision.expiresAt <= Date.now()) fail('cognitive_operation_denied');
    return { genesis, expiresAt: decision.expiresAt };
  }
  async function validateState(s, genesisDigest) {
    try {
      validateContract('state', s);
      if (!sameScope(s.binding, scope) || s.genesisDigest !== genesisDigest || !unique(s.experiences, e => e.record.id) ||
          !unique(s.skills, k => k.manifest.id) || !unique(s.skills, k => k.digest) || !unique(s.operations, o => o.id)) fail('invalid_cognitive_state');
      for (const e of s.experiences) {
        boundedJson(e.record); if (contentDigest(e.record) !== e.digest ||
          (!e.outcome.verified && (e.outcome.reward !== 'observe' || e.outcome.sourceEventId !== null)) ||
          (e.outcome.verified && (!text(e.outcome.sourceEventId) || !['reinforce', 'avoid'].includes(e.outcome.reward)))) fail('invalid_experience_state');
        if (e.outcome.verified && canonicalJson(await verifyOutcome(structuredClone(e.record), scope.namespace)) !== canonicalJson(e.outcome)) fail('invalid_experience_state');
      }
      for (const o of s.operations) {
        boundedJson(o.result, LIMITS.resultBytes);
        const skill = s.skills.find(k => k.digest === o.skillDigest);
        boundedJson(o.task);
        if (!skill || contentDigest(o.task) !== o.taskDigest || contentDigest({ kind: o.kind, skillId: skill.manifest.id, task: o.task }) !== o.inputDigest) fail('invalid_operation_state');
        if (o.kind === 'evaluate' && o.result?.status !== 'not_dispatched' && (!skill.trials.some(t => t.operationId === o.id) || !verifyEvaluationReceipt(o.result,
          { skillDigest: o.skillDigest, taskDigest: o.taskDigest, bindingDigest, operationId: o.id, environmentRevision: o.result.environmentRevision }, evaluators))) fail('invalid_operation_state');
      }
      for (const k of s.skills) {
        boundedJson(k.manifest);
        if (contentDigest(k.manifest) !== k.digest || !unique(k.trials, t => t.operationId)) fail('invalid_skill_state');
        for (const t of k.trials) {
          const operation = s.operations.find(o => o.id === t.operationId);
          if (!operation || operation.kind !== 'evaluate' || operation.skillDigest !== k.digest || canonicalJson(t.receipt) !== canonicalJson(operation.result)) fail('invalid_trial_state');
        }
        if (k.status === 'active' && !qualified(k)) fail('invalid_active_skill_state');
      }
      if (s.pending) {
        const skill = s.skills.find(k => k.digest === s.pending.skillDigest);
        boundedJson(s.pending.task);
        if (s.operations.some(o => o.id === s.pending.id) || !skill || contentDigest(s.pending.task) !== s.pending.taskDigest ||
            contentDigest({ kind: s.pending.kind, skillId: skill.manifest.id, task: s.pending.task }) !== s.pending.inputDigest) fail('invalid_pending_state');
      }
    } catch { fail('invalid_cognitive_state'); }
  }
  async function read(operation) {
    const { genesis, expiresAt } = await gate(operation);
    const row = await store.read();
    if (row === null) return { version: 0, expiresAt, state: { schemaVersion: 1, binding: scope, genesisDigest: genesis.genesisDigest, experiences: [], skills: [], operations: [], pending: null } };
    if (!row || Object.keys(row).sort().join() !== 'state,version' || !Number.isSafeInteger(row.version) || row.version < 1 || row.version >= Number.MAX_SAFE_INTEGER) fail('invalid_cognitive_state');
    await validateState(row.state, genesis.genesisDigest);
    return { version: row.version, state: structuredClone(row.state), expiresAt };
  }
  async function commit(row, bookkeepingOnly = false) {
    await validateState(row.state, row.state.genesisDigest);
    if (!bookkeepingOnly && row.expiresAt <= Date.now()) fail('cognitive_authorization_expired');
    const receipt = await store.compareAndSwap(row.version, structuredClone(row.state));
    if (receipt?.version !== row.version + 1) fail('cognitive_write_outcome_unconfirmed');
    row.version = receipt.version;
    return receipt.version;
  }
  function idle(row) { if (row.state.pending !== null) fail('cognitive_action_requires_reconciliation'); }
  function reserveCapacity(row, kind, skill, task) {
    if (row.state.operations.length >= LIMITS.operations || (kind === 'evaluate' && skill.trials.length >= LIMITS.trials) ||
        Buffer.byteLength(canonicalJson(row.state)) + Buffer.byteLength(canonicalJson(task)) + 2 * LIMITS.resultBytes + 4096 > LIMITS.stateBytes) fail('cognitive_capacity_reached');
  }
  async function snapshot() { return structuredClone((await read('read')).state); }
  async function observe(input) {
    validateContract('record', input);
    const record = structuredClone(input), digest = contentDigest(record);
    const row = await read('observe'); idle(row);
    const previous = row.state.experiences.find(e => e.record.id === record.id);
    if (previous) { if (previous.digest !== digest) fail('experience_conflict'); return structuredClone(previous.outcome); }
    if (row.state.experiences.length >= LIMITS.experiences) fail('cognitive_capacity_reached');
    const outcome = await verifyOutcome(structuredClone(record), scope.namespace);
    validateContract('outcome', outcome);
    row.state.experiences.push({ record, digest, outcome });
    await gate('observe'); await commit(row); return structuredClone(outcome);
  }
  async function proposeSkill(manifest) {
    validateContract('skill', manifest);
    const copy = structuredClone(manifest), digest = contentDigest(copy);
    const row = await read('propose'); idle(row);
    const old = row.state.skills.find(s => s.manifest.id === copy.id);
    if (old) { if (old.digest !== digest) fail('skill_revision_conflict'); return digest; }
    if (row.state.skills.length >= LIMITS.skills) fail('cognitive_capacity_reached');
    row.state.skills.push({ manifest: copy, digest, status: 'candidate', trials: [] });
    await commit(row); return digest;
  }
  async function run(kind, skillId, task, operationId) {
    if (!text(skillId) || !text(operationId)) fail('invalid_cognitive_action');
    boundedJson(task); const copy = structuredClone(task), taskDigest = contentDigest(copy), inputDigest = contentDigest({ kind, skillId, task: copy });
    let row = await read(kind);
    const completed = row.state.operations.find(o => o.id === operationId);
    if (completed) { if (completed.inputDigest !== inputDigest) fail('operation_conflict'); return structuredClone(completed.result); }
    idle(row);
    const skill = row.state.skills.find(s => s.manifest.id === skillId);
    if (!skill || (kind === 'execute' && skill.status !== 'active')) fail('skill_not_available');
    reserveCapacity(row, kind, skill, copy);
    row.state.pending = { id: operationId, inputDigest, kind, skillDigest: skill.digest, taskDigest, task: copy, phase: 'reserved' };
    await commit(row);
    let activeEnvironment;
    async function notDispatched(error) {
      row.state.operations.push({ id: operationId, inputDigest, kind, skillDigest: skill.digest, taskDigest, task: copy,
        result: { status: 'not_dispatched', reason: typeof error.code === 'string' && error.code.length <= 256 ? error.code : 'preflight_failed' } });
      row.state.pending = null;
      await commit(row, true); fail('cognitive_action_not_dispatched');
    }
    try {
      await gate(kind);
      activeEnvironment = await environment();
      if (activeEnvironment?.id !== skill.manifest.environment || !text(activeEnvironment.revision)) fail('skill_environment_mismatch');
      activeEnvironment = { id: activeEnvironment.id, revision: activeEnvironment.revision };
      await gate(kind);
    } catch (error) {
      // This exact reservation has not dispatched. Cancellation is bounded host bookkeeping.
      return await notDispatched(error);
    }
    row.state.pending.phase = 'dispatching'; await commit(row);
    // A slow durable write must not extend permission beyond its last authorization check.
    try { await gate(kind); } catch (error) { return await notDispatched(error); }
    try {
      const receiptBinding = Object.freeze({ skillDigest: skill.digest, taskDigest, environmentRevision: activeEnvironment.revision, bindingDigest, operationId });
      const result = await (kind === 'evaluate' ? evaluate : execute)({ skill: structuredClone(skill.manifest), task: copy, operationId,
        binding: structuredClone(scope), environment: structuredClone(activeEnvironment), receiptBinding });
      boundedJson(result, LIMITS.resultBytes);
      if (kind === 'evaluate' && !verifyEvaluationReceipt(result, receiptBinding, evaluators)) fail('invalid_evaluation_receipt');
      row = await read(kind);
      if (row.state.pending?.id !== operationId || row.state.pending?.inputDigest !== inputDigest || row.state.pending.phase !== 'dispatching') fail('action_reservation_changed');
      const current = row.state.skills.find(s => s.digest === skill.digest);
      if (!current) fail('skill_revision_changed');
      if (kind === 'evaluate') current.trials.push({ receipt: structuredClone(result), operationId });
      row.state.operations.push({ id: operationId, inputDigest, kind, skillDigest: skill.digest, taskDigest, task: copy, result }); row.state.pending = null;
      await commit(row); return structuredClone(result);
    } catch { fail('cognitive_action_outcome_unconfirmed'); }
  }
  async function activateSkill(skillId) {
    const row = await read('activate'); idle(row);
    const skill = row.state.skills.find(s => s.manifest.id === skillId);
    if (!skill || !qualified(skill)) fail('skill_evidence_insufficient');
    if (skill.status !== 'active') { skill.status = 'active'; await commit(row); }
    return skill.digest;
  }
  return Object.freeze({ snapshot, observe, proposeSkill, activateSkill,
    evaluateSkill: (id, task, operationId) => run('evaluate', id, task, operationId),
    executeSkill: (id, task, operationId) => run('execute', id, task, operationId) });
}
