# Runtime boundary and capability verification

Version 1.2 adds an opt-in JavaScript operation boundary in `src/runtime.mjs`. The installed package includes this library, but the installer does not intercept Codex, ChatGPT, Claude, shell commands or direct MCP tools. A host integration must route every protected operation through the boundary and withhold bypass tools before claiming enforcement. Backend ACLs and atomic operations remain authoritative.

The separate experimental Codex-to-MemQ guard implements a narrower organization-scoped plan interface. It does not implement every capability of `createRuntime`, prove an individual principal binding, or establish system-wide enforcement. Its live acceptance probe and the offline contract tests serve different purposes.

The trusted host constructs `createRuntime` with an expected service/principal/namespace/realm binding, a provider adapter, an authorization resolver and an audit sink. These dependencies must come from reviewed host configuration, never from model arguments or retrieved text. Identity must be derived from the current authenticated connection. A connection label or a local declaration is insufficient. If a service does not return the principal, the host must bind its verified OAuth session to that principal; otherwise refuse protected access.

Each call checks identity, resolves current policy, requires an expiry and policy revision, checks capability-specific requirements, checks identity again, writes a redacted dispatch receipt and invokes the adapter. The adapter normalizes results and verifies returned scope. Audit receipts contain operation and scope digests, timing and status, not payloads or credentials. Digests remain private operational metadata. An audit failure after dispatch leaves an ambiguous outcome, requiring reconciliation. Operation IDs correlate attempts; the library does not promise exactly-once execution.

Supported operations are read, write, checkpoint, resume, update, delete, reflect and transfer. `update` requires an expected version and a backend that actually implements compare-and-swap. A version check protects a record update; it does not establish a lease or fence external side effects. Keep one writer unless a separate coordinator verifies ownership and fencing.

Transfer requires a current grant bound to source, authenticated destination, purpose, permitted data class, maximum projection size and expiry. The adapter must atomically recheck revocation and consume the operation ID with transfer. The synthetic test backend demonstrates the contract only. It is not a production federation gateway. Receiving applications treat transferred content as untrusted evidence; grants never transfer instruction authority. Retraction requires destination and cache receipts and cannot erase already delivered copies.

The runtime refuses deletion when unsupported, and refuses exclusion-dependent writes or reflection when learning exclusion is unverified. Metadata alone does not prove exclusion. Audit capabilities separately for scheduling, reflection sources, distillation, reinforcement, consolidation and promotion. A fix in one path is not proof of all paths or deployed behavior.

## Search visibility and retrieval quality

`waitForVisibility` accepts a known record ID plus scoped exact-read and search callbacks. It only polls reads, with a bounded attempt count and delay. A durable journal receipt and a completed indexing job do not guarantee immediate query visibility. On timeout, report persistence and searchability separately. Never repeat a write to compensate for an empty search; reconcile the original receipt first.

Capture source embedding provider/model/dimension separately from storage profile, translation method and actual inference execution. Projection into a neural model's vector dimension is not neural inference. A hash-vector retrieval path should be evaluated for paraphrase recall and unrelated-query rejection. If targeted recall misses, inspect the scoped exact/journal source and try a bounded reformulation grounded in the task. Do not broaden the account or claim the missing fact does not exist.

## Behavioral evaluation

`mnx-agi evaluate FILE.json` scores paired externally observed baseline/memory runs. It never executes models or treats fixtures as performance evidence. Supply schemaVersion 1 and runs containing variant, taskId, trialId, model, harnessRevision, policyRevision, evidenceRef, correct, falseCompletion, unauthorizedAction, realmLeak, recovered, latencyMs, toolCalls, contextTokens and costUsd. Variants are baseline or memory. Use measured values; do not substitute zero for unknown cost or tokens.

Run interrupted recovery, stale-memory correction, conflicting-source resolution, same-team handoff, missing-memory fallback and prohibited cross-realm disclosure. Freeze acceptance criteria outside the agent, randomize variant order, use independent held-out trials, and review actual traces. Match model/harness/policy revisions across paired runs. A passing score is not automatic adoption approval. The shipped tests are offline adapter/contract tests, distinct from live provider conformance and model behavioral trials.

## Adoption checklist

1. Verify install integrity and actual host discovery.
2. Bind the authenticated principal and namespace from trusted sources.
3. Verify the provider's live capability contracts using isolated authorized data.
4. Route protected calls through the adapter and remove bypass paths in the host.
5. Run negative scope/grant tests and paired behavioral trials.
6. Release only the capabilities with current evidence; retain private deployment receipts separately.
