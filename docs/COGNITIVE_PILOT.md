# Opt-in cognitive pilot

This library implements the first local experiment, not a hosted autonomous agent. It is not installed or activated by ordinary harness installation. It does not train a model, create an agent process, or establish general intelligence.

`src/genesis.mjs` validates a v1 Multinex founding manifest. The founder is Christopher Rijos, with the role Supreme Architect. A host-supplied expected binding must match the system, realm, founder identity reference, adopted Accord digest, and amendment-policy digest. An Ed25519 signature is checked against a host-owned public-key registry; an embedded key cannot authorize itself. Revoked keys fail verification. The immutable founding identity does not override host policy, and each operation checks current authorization.

`schemas/genesis.schema.json` describes the manifest. `genesisSigningBytes` defines the domain-separated signing bytes; `contentDigest` defines the canonical JSON digest. Do not sign a production founding manifest using a test key. No production founder key or signature is included in this package. Key custody, identity verification, approved policy artifacts, and recovery must be established before real enrollment.

`src/cognitive-session.mjs` accepts host-owned trust, authorization, environment, persistence, verifier, evaluator, and execution adapters. It supports observations, candidate skills, independent practice/held-out trials, activation, and execution after a new session reads the same store. The host evaluator supplies the trial split and evidence, never the model. Passing synthetic arithmetic or workflow fixtures proves protocol behavior only, not general learning or transfer.

Persistence requires a compare-and-swap store. MemQ's opt-in `createCognitivePlanStore` adapts its existing R2 plan-state backend; the local filesystem backend does not advertise concurrent CAS. The pilot has one outstanding external operation per instance, a 128 KiB state limit, and a 1,000-operation/experience bound. A durable reservation precedes execution. Completed operation IDs are idempotent; uncertain operations remain reserved and require operator/adapter reconciliation. There is no automatic lease takeover, unattended recovery, global federation, or claim of exactly-once third-party side effects.

Existing runtime methods and installation defaults are unchanged. This pilot does not expand the managed broker's tool surface or bypass its enrollment. Integration must use an authorized host route. Authority enforcement extends only as far as the configured host adapters and backing service controls.

## Verification

Run `node --test test/genesis.test.mjs test/cognitive-session.test.mjs` for local contract tests, then the full package test and release checks. The MemQ repository includes an explicit cross-repository integration test that requires this repository as a sibling checkout. It replaces both adapters while retaining its synthetic conditional backend, verifies source-signed evidence, and executes an activated skill under the same genesis.

Before active deployment: bind the real founder identity, sign the reviewed Accord, qualify live R2 persistence and the managed host path, add operational reconciliation and migration tooling, and run independently verified tasks with real model adapters. These remain acceptance gates, not properties implied by the unit tests.

## M01 contract hardening compatibility

The opt-in local cognitive adapter now uses the shared cognitive v1 schema and canonical JSON v1 bytes. Sparse arrays, non-finite values, ambiguous timestamps, unsafe keys, oversized payloads and unknown executable fields are refused. Persisted operations retain their task and digest; trials must reference the exact completed operation, and an active skill must still satisfy qualification when loaded.

Evaluation adapters receive a `receiptBinding` containing the exact skill digest, task digest, environment revision, scope binding digest and operation ID. They return a strict Ed25519-signed receipt using `evaluationSigningBytes`. Host configuration supplies `evaluationPolicy.trustedEvaluators`; each evaluator is bound to a public key, split authority and allowed splits. The signed receipt also carries its independently assigned source group. Candidate task text cannot select an evaluator key or create independent held-out evidence. Production evaluator enrollment remains M02/M05 work.

This intentionally rejects the earlier pilot's unsigned evaluator results and incomplete persisted operation/trial shapes. Existing pilot state must be explicitly migrated or restarted in an isolated test instance; it is never silently promoted. No deployed cognitive-state migration is performed by these changes. Empty evaluator configuration permits observations/proposals but cannot qualify new skills.

The session preflights bounded task/result/state capacity before dispatch. A known pre-dispatch denial is recorded as `not_dispatched`, preserving the operation ID; an uncertain result after dispatch retains its durable `dispatching` reservation and requires reconciliation. This is not proof of exactly-once side effects or full reconciliation support. Host authorization is checked again after the durable dispatch marker.
