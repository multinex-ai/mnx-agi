# Compact memory and the 30% efficiency target

The target is 30% fewer whole-task AI tokens and 30% lower combined AI and memory cost on representative resumed tasks, while preserving correctness, recovery and project isolation. This is an acceptance target, not a result already achieved.

The installed `mnx-memq-compact` skill starts with one known task checkpoint, expands only needed evidence and avoids repeated manuals, transcripts, duplicate summaries and full tool catalogs. A checkpoint holds concise state and references to source artifacts. It never replaces fresh identity, authorization or deployment checks.

## Broker interface

`context_read` takes `plan_id`, optional `max_bytes` (1,000–12,000; default 6,000), and optional `known_version`. It verifies the same fixed peer, account and plan boundary as other operations, reads the plan without message/artifact expansion, then returns only `mnx_compact_v1` plus the plan ID and version. An unchanged version returns a small acknowledgement. Malformed or oversized stored context is rejected; constraints and pending actions are never silently truncated. Limits are encoded bytes, not tokens.

`checkpoint_write` takes `plan_id`, `expected_state_version`, and a strict `checkpoint` object. Its fields are `schema_version: 1`, `objective`, `acceptance`, `done`, `next`, `blockers`, `constraints`, `pending_effects`, `evidence`, and `artifacts`. Text-list fields contain at most eight short strings. Artifacts contain only `ref` and `revision`. The entire checkpoint is capped at 10,000 encoded bytes. Store references rather than document contents.

Writes use the provider's conditional version check and return a small acknowledgement; the caller must read back to verify content. New plan creation uses expected version zero only after reconciling whether a prior attempt succeeded. Legacy `plan_read` and `plan_write` remain available for compatibility; compact output is an efficient workflow, not an additional access-control boundary. Read-time validation still rejects malformed data written through legacy tools.

## Measure before claiming savings

`mnx-agi evaluate FILE.json` accepts paired baseline/memory runs. Existing correctness and trace fields remain required. For measured efficiency, each run additionally supplies host-reported `inputTokens`, `outputTokens`, `cachedInputTokens`, `tokenSource: "host"`, and `memoryCostUsd`. `costUsd` covers all AI calls in that run; memory-service costs are added separately. Count retries, tool-response context, checkpoint creation and later retrieval. Allocate shared setup costs consistently across both variants.

The result reports token and cost reductions separately. A zero-cost baseline cannot establish a percentage cost reduction. Unknown or estimated usage does not qualify. Cached input remains part of token totals; its price benefit belongs in observed cost. The target fails if correctness or recovery falls, or if the memory variant makes an unauthorized action, leaks realm data or falsely claims completion.

Use held-out resumed tasks, interrupted writes, stale decisions, contradictory sources, irrelevant retrieval and project-switch scenarios. Repeat stochastic trials and inspect traces. The scorer does not run models, authenticate submitted records, prove statistical significance or automatically approve adoption. Report sample size, measurement limitations and any tasks where the compact workflow performs worse.
