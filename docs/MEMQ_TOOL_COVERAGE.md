# MemQ workflow coverage

The package installs eleven focused skills for each selected host. These workflows cover the MemQ tool families below without loading every workflow into every task. Tool names describe the catalog inspected during development; discover current schemas and permissions on the active connection before use. A catalog entry is not a permission grant or a promise of deployment support.

| Task | Packaged workflow | Relevant provider tools, when exposed and authorized |
|---|---|---|
| Establish account and realm | `mnx-realm-context`, `mnx-memq-operate` | `reunion`, `namespace_info` |
| Diagnose service and budget | `mnx-memq-operate` | `health_check`, `memory_status` |
| Load bounded context | `mnx-memq-recall` | `mnemosyne_context`, `hybrid_retrieve`, `slice_project`, `recent_memory` |
| Search selected private evidence | `mnx-memq-recall` | `query_memory`, `search_memory`, `journal_search` |
| Resolve event order and associations | `mnx-memq-recall` | `brain_recall_episode`, `brain_associate`, `temporal_graph_query`, `brain_discover` |
| Persist selected knowledge or sources | `mnx-memq-ingest`, `mnx-memq-learn` | `slicer_slice`, `add_memory`, `save_context`, `journal_record` |
| Save and resume progress | `mnx-memq-checkpoint` | `plan_state_read`, `plan_state_write`, `plan_state_checkpoint`, `plan_state_resume` |
| Coordinate authorized work | `mnx-memq-coordinate` | Plan-state tools, `slice_project`, `bridge_sync` |
| Evaluate and retain lessons | `mnx-memq-learn`, `mnx-harness-evaluate` | `reflect_memory`, `reflection_handoff`, `brain_predict`, `brain_reinforce`, `brain_consolidate_sleep`, `journal_distill` |
| Discover approved shared knowledge | `mnx-realm-federation` | `commons_search`, `commons_resonance`, `commons_promotion_status` |
| Correct, export or retire records | `mnx-memq-maintain` | Discover a verified lifecycle API; the inspected catalog does not establish a general deletion, export or revocation API |
| Choose an eligible tool or model | `mnx-decision-routing` | Host-specific routing; no MemQ call is compulsory |

Aliases and overlapping retrieval paths are alternatives, not a checklist of calls. Start with the smallest query that can resolve the next decision. Check exact records and source revisions when ranked retrieval is inconclusive. More context, repeated writes and repeated reinforcement are not evidence of improved performance.

## Enforced host capability limits

The experimental credential broker exposes `plan_read` and `plan_write`, mapped to provider `plan_state_read` and `plan_state_write`. Its fixed OS-identity binding, allowed plan prefix, conditional version, current OAuth subject and namespace checks apply before dispatch. It does **not** expose the provider's search, ingestion, learning, commons or lifecycle catalog.

All eleven skills can be installed while some operations remain unavailable. A skill must report an unavailable capability and continue independent work where possible. It must never use a direct provider connection, another account or a wider namespace to bypass the host boundary. Expanding the broker requires a separately reviewed adapter and tests for the new operation's input, output, authorization and side effects.

## Retrieval and vector evaluation

Before changing embeddings, translation profiles or retrieval settings, use `mnx-harness-evaluate` with a held-out set of source-backed questions. Measure exact-source recovery, paraphrase retrieval, unrelated-query rejection, cross-project exclusion, latency and cost. Record provider/model/dimension and translation method separately. Keep the previous profile recoverable; a compatible vector dimension does not establish semantic equivalence.

For learning changes, compare against a simpler recall-only baseline. Preserve provenance, learning exclusions and contrary examples. Distillation output is not authorization to train a model, and shared candidate discovery is not approval to publish private knowledge.

## Installation and proof

Use the package's global installation for Codex and Claude or its project installation for Codex. No additional third-party skill repository is required for these workflows. Existing similarly named local skills are preserved; packaged `mnx-*` skills form the versioned set managed by the installer.

The release tests verify that all eleven entry points and their references install byte-for-byte for both hosts. Local checks establish installation integrity. Actual model selection of a skill, connection availability, service authorization, operation success and mandatory enforcement require their own observed acceptance evidence.
