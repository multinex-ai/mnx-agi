---
name: mnx-memq-coordinate
description: Coordinate ownership, checkpoints and handoffs when multiple authorized agents work on the same task. Use for shared-task continuity; this skill does not itself authorize delegation.
---

# Memq coordinate

This skill follows the active host instructions and authorized task.

Confirm that delegation or collaboration is already authorized by the user and host. Read [the MemQ contract](references/MEMQ_CONTRACT.md) and [realm architecture](references/ARCHITECTURE.md). Bind each worker to an objective, writable scope, acceptance criteria, budget/stop condition and current revision.

Read existing plan ownership before assigning work. A read followed by a plan-record write is not assumed to be atomic. Use the actual host coordinator or a verified lease/CAS mechanism; without it, serialize contested writes. Do not take over merely because a timestamp looks old. Reconcile owner status and transfer authority explicitly.

Same-namespace collaboration requires both participants to verify the intended shared scope. Different namespaces require the federation workflow rather than an invented namespace parameter. Project a minimal context slice instead of handing over all memory.

Checkpoint meaningful progress and retain evidence references. A handoff includes done/next/blocked state, artifact revisions, scope and the ownership-transfer condition. Recording a handoff is not proof that a recipient was notified, accepted, or completed work. Deliver messages only through an authorized communication channel.

Before merging results, recheck artifact revision, permission, independent verification and acceptance criteria. Report partial outcomes honestly; one worker completing does not complete the parent objective. Do not run mutating lifecycle sweeps or broad synchronization merely for housekeeping.

Read [runtime verification](references/RUNTIME.md) when integrating a host adapter, probing search visibility, evaluating learning exclusion or testing grants. Keep local contract tests, live service checks and behavioral evaluations separate.

Use [the tool coverage map](references/MEMQ_TOOL_COVERAGE.md) to select among currently exposed capabilities. Installed skills do not grant access to tools withheld by the host.
