import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluationFixture } from './fixtures/evaluation.mjs';
import { contentDigest, LIMITS } from '../src/cognitive-contracts.mjs';
import { genesisFixture } from './fixtures/genesis.mjs';
import { createCognitiveSession } from '../src/cognitive-session.mjs';

function fixture() {
  const g = genesisFixture(), evaluator = evaluationFixture(); let row = null, calls = 0, denied = false;
  const scope = { service: 'memq-test', principal: 'test-user', namespace: 'test-namespace', realm: 'research' };
  const store = { capabilities: { compareAndSwap: true }, read: async () => structuredClone(row), compareAndSwap: async (version, state) => {
    if (version !== (row?.version ?? 0)) throw new Error('version_conflict'); row = { version: version + 1, state: structuredClone(state) }; return { version: row.version };
  } };
  const config = { binding: scope, signedGenesis: g.signed, expectedGenesis: g.expected, trust: async () => ({ trustedKeys: g.trustedKeys }), store,
    environment: async () => ({ id: 'synthetic-api', revision: 'fixture-v1' }),
    authorize: async () => ({ allowed: !denied, policyRevision: 'test-v1', expiresAt: Date.now() + 60000 }),
    verifyOutcome: async () => ({ verified: false, reward: 'observe', sourceEventId: null }),
    evaluationPolicy: evaluator.policy,
    evaluate: async ({ task, receiptBinding }) => { calls++; return evaluator.receipt(receiptBinding, { sourceEventId: task.id, split: task.split, independentSourceGroup: task.group ?? task.id }); },
    execute: async () => { calls++; return { answer: 42 }; } };
  return { config, evaluator, mutate: fn => fn(row), state: () => row, session: () => createCognitiveSession(config), calls: () => calls, deny: () => { denied = true; } };
}
const skill = { id: 'retry-procedure', environment: 'synthetic-api', procedure: { steps: ['use idempotency key', 'inspect operation status'] } };
test('candidate needs independent practice and held-out trials; active skill survives session replacement', async () => {
  const f = fixture(), a = f.session(); await a.proposeSkill(skill);
  await assert.rejects(a.activateSkill(skill.id), /insufficient/);
  await a.evaluateSkill(skill.id, { id: 'p1', split: 'practice' }, 'trial-p1');
  await assert.rejects(a.activateSkill(skill.id), /insufficient/);
  await a.evaluateSkill(skill.id, { id: 'h1', split: 'held_out' }, 'trial-h1'); await a.activateSkill(skill.id);
  await a.activateSkill(skill.id); // Repeated activation must not require a new CAS version.
  const b = f.session(); assert.equal((await b.snapshot()).skills[0].status, 'active');
  assert.deepEqual(await b.executeSkill(skill.id, { id: 'new-task' }, 'execute-1'), { answer: 42 });
  await b.executeSkill(skill.id, { id: 'new-task' }, 'execute-1'); assert.equal(f.calls(), 3);
});
test('unverified observations stay neutral and conflicting operation ids are rejected', async () => {
  const a = fixture().session(), input = { id: 'x', text: 'I succeeded', metadata: { outcome: 'success' } };
  assert.equal((await a.observe(input)).verified, false); await a.observe(input);
  assert.equal((await a.snapshot()).experiences.length, 1);
  await assert.rejects(a.observe({ ...input, text: 'changed' }), /experience_conflict/);
});
test('an uncertain side effect leaves a durable reservation and is never replayed', async () => {
  const f = fixture(); f.config.evaluate = async () => { throw new Error('network timeout'); };
  const a = f.session(); await a.proposeSkill(skill);
  await assert.rejects(a.evaluateSkill(skill.id, {}, 'uncertain'), /outcome_unconfirmed/);
  await assert.rejects(f.session().evaluateSkill(skill.id, {}, 'uncertain'), /requires_reconciliation/);
});
test('different session scopes and revoked authorization fail closed', async () => {
  const f = fixture(); await f.session().proposeSkill(skill);
  f.config.binding = { ...f.config.binding, namespace: 'foreign' };
  await assert.rejects(f.session().snapshot(), /invalid_cognitive_state/);
  f.deny(); await assert.rejects(f.session().snapshot(), /denied/);
});

test('the same source cannot count as independent practice and held-out evidence', async () => {
  const a = fixture().session(); await a.proposeSkill(skill);
  await a.evaluateSkill(skill.id, { id: 'copied-result', split: 'practice' }, 'p1');
  await a.evaluateSkill(skill.id, { id: 'copied-result', split: 'held_out' }, 'h1');
  await assert.rejects(a.activateSkill(skill.id), /insufficient/);
});

test('host-observed environment mismatch blocks external evaluation', async () => {
  const f = fixture(); f.config.environment = async () => ({ id: 'different-api', revision: 'v2' });
  const a = f.session(); await a.proposeSkill(skill);
  await assert.rejects(a.evaluateSkill(skill.id, { id: 'wrong-environment', split: 'practice' }, 'env-test'), /not_dispatched/);
  assert.equal((await a.snapshot()).pending, null);
  assert.equal((await a.snapshot()).operations[0].result.status, 'not_dispatched');
  assert.equal(f.calls(), 0);
});

test('trust provider cannot override pinned genesis or expectations', async () => {
  for (const field of ['signed', 'expected', 'unrecognized']) {
    const f = fixture(), previous = f.config.trust;
    f.config.trust = async () => ({ ...(await previous()), [field]: {} });
    await assert.rejects(f.session().snapshot(), /trust_provider/);
  }
});
test('signed evaluator receipt binds exact skill, task, environment, scope and operation', async () => {
  for (const field of ['skillDigest', 'taskDigest', 'environmentRevision', 'bindingDigest', 'operationId', 'splitAuthorityId', 'evaluatorId']) {
    const f = fixture(); f.config.evaluate = async ({ receiptBinding }) => f.evaluator.receipt(receiptBinding, { [field]: field.includes('Digest') ? '0'.repeat(64) : 'other' });
    const a = f.session(); await a.proposeSkill(skill);
    await assert.rejects(a.evaluateSkill(skill.id, { id: 'task' }, 'evaluate'), /outcome_unconfirmed/);
    assert.equal((await a.snapshot()).pending.phase, 'dispatching');
  }
});
test('unsigned or modified evaluator verdicts cannot qualify a skill', async () => {
  for (const mutate of [r => { delete r.signature; }, r => { r.passed = !r.passed; }, r => { r.explanation = 'model says success'; }]) {
    const f = fixture(); f.config.evaluate = async ({ receiptBinding }) => { const r = f.evaluator.receipt(receiptBinding); mutate(r); return r; };
    const a = f.session(); await a.proposeSkill(skill);
    await assert.rejects(a.evaluateSkill(skill.id, {}, 'tampered'), /outcome_unconfirmed/);
  }
});
test('different event IDs with the same signed lineage do not establish split independence', async () => {
  const a = fixture().session(); await a.proposeSkill(skill);
  await a.evaluateSkill(skill.id, { id: 'practice', split: 'practice', group: 'shared-corpus' }, 'p');
  await a.evaluateSkill(skill.id, { id: 'held-out-copy', split: 'held_out', group: 'shared-corpus' }, 'h');
  await assert.rejects(a.activateSkill(skill.id), /insufficient/);
});
test('persisted state rejects injected fields, forged activation, broken digests and corrupted pending actions', async () => {
  for (const mutate of [s => { s.execute = 'injected'; }, s => { s.skills[0].status = 'active'; },
    s => { s.skills[0].digest = '0'.repeat(64); }, s => { s.operations = [{ id: 'bad' }]; },
    s => { s.pending = {}; }, s => { s.experiences = [{ record: {} }]; }]) {
    const f = fixture(); await f.session().proposeSkill(skill); f.mutate(row => mutate(row.state));
    await assert.rejects(f.session().snapshot(), /invalid_cognitive_state/);
    assert.equal(f.calls(), 0);
  }
});
test('persisted trial and operation changes cannot reuse a signed verdict', async () => {
  for (const mutate of [s => { s.skills[0].trials[0].receipt.passed = false; },
    s => { s.operations[0].task = { changed: true }; }, s => { s.skills[0].trials = []; }, s => { s.skills[0].trials[0].operationId = 'unrelated'; }]) {
    const f = fixture(), a = f.session(); await a.proposeSkill(skill);
    await a.evaluateSkill(skill.id, { id: 'p', split: 'practice' }, 'p');
    f.mutate(row => mutate(row.state)); await assert.rejects(f.session().snapshot(), /invalid_cognitive_state/);
  }
});
test('capacity exhaustion is refused before any external dispatch and preserves operation IDs', async () => {
  const f = fixture(), a = f.session(); await a.proposeSkill(skill);
  for (let i = 0; i < 28; i++) await a.observe({ id: `large-${i}`, text: 'x'.repeat(4096), metadata: {} });
  await assert.rejects(a.evaluateSkill(skill.id, { id: 'capacity', split: 'practice' }, 'capacity-operation'), /capacity/);
  assert.equal(f.calls(), 0); assert.equal((await a.snapshot()).pending, null);
});
test('denial after reservation is recorded as not dispatched and does not block the next authorized action', async () => {
  const f = fixture(); f.config.environment = async () => { throw Object.assign(new Error('denied'), { code: 'environment_denied' }); };
  const a = f.session(); await a.proposeSkill(skill);
  await assert.rejects(a.evaluateSkill(skill.id, {}, 'denied-before-dispatch'), /not_dispatched/);
  const state = await a.snapshot(); assert.equal(state.pending, null); assert.equal(state.operations[0].result.reason, 'environment_denied');
  assert.deepEqual(await a.evaluateSkill(skill.id, {}, 'denied-before-dispatch'), { status: 'not_dispatched', reason: 'environment_denied' });
  assert.equal(f.calls(), 0);
});

test('authorization revoked during the durable dispatch-marker write prevents external work', async () => {
  const f = fixture(), cas = f.config.store.compareAndSwap;
  f.config.store.compareAndSwap = async (version, state) => {
    const receipt = await cas(version, state);
    if (state.pending?.phase === 'dispatching') f.deny();
    return receipt;
  };
  const a = f.session(); await a.proposeSkill(skill);
  await assert.rejects(a.evaluateSkill(skill.id, {}, 'revoke-at-marker'), /not_dispatched/);
  assert.equal(f.calls(), 0); assert.equal(f.state().state.pending, null);
  assert.equal(f.state().state.operations[0].result.status, 'not_dispatched');
});

test('a repeated source event cannot become independent by changing its signed group label', async () => {
  const a = fixture().session(); await a.proposeSkill(skill);
  await a.evaluateSkill(skill.id, { id: 'same-event', split: 'practice', group: 'practice-group' }, 'p');
  await a.evaluateSkill(skill.id, { id: 'same-event', split: 'held_out', group: 'renamed-group' }, 'h');
  await assert.rejects(a.activateSkill(skill.id), /insufficient/);
});
