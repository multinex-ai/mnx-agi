import test from 'node:test';
import assert from 'node:assert/strict';
import { genesisFixture } from './fixtures/genesis.mjs';
import { createCognitiveSession } from '../src/cognitive-session.mjs';

function fixture() {
  const g = genesisFixture(); let row = null, calls = 0, denied = false;
  const scope = { service: 'memq-test', principal: 'test-user', namespace: 'test-namespace', realm: 'research' };
  const store = { capabilities: { compareAndSwap: true }, read: async () => structuredClone(row), compareAndSwap: async (version, state) => {
    if (version !== (row?.version ?? 0)) throw new Error('version_conflict'); row = { version: version + 1, state: structuredClone(state) }; return { version: row.version };
  } };
  const config = { binding: scope, signedGenesis: g.signed, expectedGenesis: g.expected, trust: async () => ({ trustedKeys: g.trustedKeys }), store,
    environment: async () => ({ id: 'synthetic-api', revision: 'fixture-v1' }),
    authorize: async () => ({ allowed: !denied, policyRevision: 'test-v1', expiresAt: Date.now() + 60000 }),
    verifyOutcome: async () => ({ verified: false, reward: 'observe', sourceEventId: null }),
    evaluate: async ({ task }) => { calls++; return { passed: true, sourceEventId: task.id, split: task.split, evidenceRef: 'test:result' }; },
    execute: async () => { calls++; return { answer: 42 }; } };
  return { config, session: () => createCognitiveSession(config), calls: () => calls, deny: () => { denied = true; } };
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
  await assert.rejects(a.evaluateSkill(skill.id, { id: 'wrong-environment', split: 'practice' }, 'env-test'), /outcome_unconfirmed/);
  assert.equal(f.calls(), 0);
});
