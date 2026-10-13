---
name: mnx-memq-checkpoint
description: Capture or resume durable task state at a meaningful phase boundary, before interruption, or during long-running work. Preserve artifact and checkpoint identities across agents and sessions.
---

# Memq checkpoint

This skill follows the active host instructions and authorized task.

Use [the MemQ contract](references/MEMQ_CONTRACT.md). Distinguish the harness runtime checkpoint from a MemQ summary or plan record. Neither a recent-memory list nor an inferred timestamp replaces a known checkpoint.

For capture, record objective and authorized scope, task/run IDs, current artifact revision, completed acceptance criteria, remaining work, blockers, immediate next action, relevant decision/evidence references and unresolved side effects. Keep private working thoughts, credentials and unrelated messages out of the record.

Use only supported fields and known returned IDs. Inspect persistence receipts. If a write times out ambiguously, reconcile its operation state before retrying. Do not claim every backend was updated unless the receipt demonstrates that guarantee.

If remote persistence is unavailable, use an approved realm-local checkpoint and identify it as local only. Before later flushing an outbox, recheck identity, destination, current authorization, duplicates and privacy. An old queued write is not permanently authorized.

For resume, load the actual checkpoint using the current schema and IDs; reread current artifacts and ownership state. Reconcile actions that may already have happened before replay. A checkpoint records work; it does not grant publication, deployment or federation permission.

Use [adaptive memory workflows](references/MEMORY_WORKFLOWS.md) for task-specific retrieval, stopping conditions, compaction, learning quality and performance evaluation.

Read [runtime verification](references/RUNTIME.md) when integrating a host adapter, probing search visibility, evaluating learning exclusion or testing grants. Keep local contract tests, live service checks and behavioral evaluations separate.
