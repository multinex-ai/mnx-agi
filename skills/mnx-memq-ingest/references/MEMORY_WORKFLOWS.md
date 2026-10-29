# Adaptive memory workflows

Use MemQ's supported capabilities where they improve the task. More calls, more context and more stored text are not performance objectives. The objectives are correct completion, reliable resumption, fewer repeated failures and useful retained knowledge within a bounded cost.

## Select a workflow

| Situation | First useful operation | Expand only when needed |
|---|---|---|
| Simple self-contained task | Current task evidence | No compulsory memory ceremony |
| Continuing project | Compact objective context | Retrieve a decision, procedure or failure that changes the next action |
| Interrupted task | Known checkpoint and current artifact revision | Episode replay when event order is unresolved; reconcile ambiguous side effects |
| Debugging | Error-specific facts and previously verified procedures | Associated memories for a remaining gap; test hypotheses against current code |
| Research | Relevant source-backed knowledge | Contrary evidence, date/validity checks and permitted shared knowledge |
| Context pressure | Durable done/next/blocked checkpoint | Compact the working set; preserve evidence references and unresolved obligations |
| Verified useful outcome | Deduplicated fact, procedure or failure record | Reflection, independent-reuse reinforcement, and scoped consolidation |

Before protected operations, resolve project ownership and verify service/principal/namespace. Discover live schemas and distinguish supported, authorized, unavailable and unverified capabilities. Never route around missing identity. An old handbook's backend, quota or atomicity claims require current evidence.

## Context composition and stopping

Keep the objective, acceptance criteria, constraints, current artifact revision, unresolved questions and next action in the working set. Retrieve references first, expand relevant sources just in time, and avoid copying whole journals. Separate facts, procedures, episodes, hypotheses and execution checkpoints. Preserve source IDs, observed dates, validity conditions and supersession links.

Start with a small task-appropriate retrieval budget; expand only for a named unresolved question. Stop when the evidence supports the next action, two successive expansions add no useful evidence, or the budget is exhausted. Budget retries too. A failure to retrieve is not proof that a fact is false. Prefer an explicit unknown over unsupported synthesis.

For contradictions, find the original sources and check their scope and dates. Do not resolve a conflict by counting repeated summaries or choosing the most recent record blindly. Keep both claims with their applicability until current evidence resolves them. Compaction must retain unresolved blockers, authorization boundaries and uncertain side effects.

## Learning quality

Write only selected outcomes that can improve future decisions. Check duplicates before writing, keep evidence and applicability limits, and require persistence receipts. Reinforce only an independently observed successful reuse, never repeated submission of the same text. A model prediction is a hypothesis; a reflection is a derived claim. Neither changes policy or earns confidence without evidence.

Consolidate when there is a useful body of new evidence or a resolved conflict and the mutation is authorized. Avoid automatic consolidation at every greeting or close. Ambiguous writes are reconciled before retry. Shared publication and retraction require their own grants; private learning never implicitly authorizes export.

## Offline planner

`node bin/mnx-agi.mjs memory-plan examples/memory-plan.json`

The planner accepts `task` (simple/research/build/debug/resume), `scope` (unknown/mismatch/matched), a list of logical `capabilities`, boolean `signals`, and `maxCalls` (0–24). See the example and unit tests for the exact vocabulary. It prints an ordered, bounded candidate plan. Each step costs at most one planned call; retries consume the same overall budget. Missing capabilities are deferred, and checkpointing is prioritized under pressure.

`matched` is an input declaration, not verified identity. Every protected step carries an execution gate. The caller must reverify identity, permission and the live tool schema, evaluate each step's condition after earlier results, and skip unnecessary steps. No remote calls, authorization, secrets, payload storage, credential handling or automatic fallback are implemented. The output always says `advisoryOnly: true` and `runtimeVerified: false`. The planner is a reusable planning primitive, not an enforcement gateway.

## Evaluate actual performance

Compare the same representative tasks under current behavior, compact recall, and adaptive recall plus learning. Include stale decisions, conflicting records, irrelevant highly ranked memories, interrupted writes, context pressure, missing capabilities and wrong-account attempts. Keep an unseen task set for evaluating learned procedures.

Record correctness and verified completion first, then recovery success, repeated-failure rate, useful retrieved evidence, calls, tokens, latency and cost. A candidate must not introduce unauthorized access or false completion. Repeat stochastic tasks and report sample size and uncertainty. Unit tests prove planner invariants; they do not demonstrate intelligence or end-to-end performance gains. Keep changes reversible until behavioral evidence supports broader adoption.
