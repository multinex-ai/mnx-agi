import { generateKeyPairSync, sign } from 'node:crypto';
import { evaluationSigningBytes } from '../../src/cognitive-contracts.mjs';
export function evaluationFixture() {
  const key = generateKeyPairSync('ed25519');
  const policy = { trustedEvaluators: { fixture: { publicKey: key.publicKey.export({ type: 'spki', format: 'pem' }).toString(), splitAuthorityId: 'fixture-corpus-v1', splits: ['practice', 'held_out'] } } };
  function receipt(binding, { passed = true, sourceEventId = 'event', split = 'practice', independentSourceGroup = sourceEventId, ...overrides } = {}) {
    const body = { schemaVersion: 1, passed, sourceEventId, split, independentSourceGroup, evidenceRef: `fixture:${sourceEventId}`,
      evaluatorId: 'fixture', splitAuthorityId: 'fixture-corpus-v1', observedAt: new Date().toISOString(), ...binding, ...overrides };
    return { ...body, signature: sign(null, evaluationSigningBytes(body), key.privateKey).toString('base64') };
  }
  return { policy, receipt };
}
