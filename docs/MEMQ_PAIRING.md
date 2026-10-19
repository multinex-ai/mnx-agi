# MNX-AGI + MemQ

**A Recursive Agent Harness with memory that carries the work forward.**

MNX-AGI organizes how agents work. MemQ retains the selected knowledge they can reuse. The pairing is designed for continuity across compatible models, authorized agents, and sessions: keep useful context available, preserve progress through interruption, and build on verified outcomes.

This is reusable infrastructure for existing agent hosts and applications. The adoption unit is a workflow, skill, memory connection, or verified adapter. Teams can adopt these pieces together without moving their work into a custom desktop or operating system.

## Two complementary responsibilities

| MNX-AGI: the harness | MemQ: the memory layer |
|---|---|
| Objectives, constraints, and acceptance criteria | Selected durable facts, decisions, and procedures |
| Task-appropriate skills and tool selection | Relevant context retrieved through a configured connection |
| Verification and evidence standards | Source references, provenance, and continuity records |
| Rules for ownership, handoffs, and realm isolation | Knowledge available within authenticated account scope |
| Evaluation before adopting workflow changes | Stored lessons available for future, independently verified reuse |

The current package contains installable instructions and skills, local validation, an optional runtime boundary, and an experimental Codex-to-MemQ adapter. The host and service enforce real permissions. The harness's instructions alone do not establish a security boundary.

## One work cycle becomes the foundation for the next

1. **Orient and recall.** Resolve the active project and account; retrieve only the context that can change the next action.
2. **Plan and act.** Use the model and tools appropriate for the task, within its authorized scope and budget.
3. **Verify.** Check the outcome against current artifacts, service evidence, and acceptance criteria.
4. **Checkpoint and learn.** Save selected progress or a reusable lesson with provenance and uncertainty.
5. **Resume and reuse.** A later session or authorized agent retrieves that knowledge, checks freshness, and applies it to current work.
6. **Evaluate and refine.** Evidence from repeated use can justify a reviewed improvement to a skill or workflow.

This is bounded recursion through work, evidence, and memory. It does not require agents to spawn more agents or keep running indefinitely. Small tasks can complete in one cycle without a memory call. A failed task may produce a useful failure record, but an unverified conclusion must remain labeled as such.

## Continuity across models and agents

Memory is connected to an authorized project scope rather than tied to a single model's context window. Compatible agents can retrieve approved knowledge from that scope through supported connections. A model switch should preserve the meaning of the task, decisions, acceptance criteria, and evidence even when prompts or tool adapters differ.

For example, an agent investigating a bug can save the verified cause, affected revision, checks performed, and remaining work. A later authorized agent can retrieve that checkpoint and continue from the current repository. It still rechecks the revision and relevant facts; memory is context, not proof that today's state matches yesterday's.

Codex and Claude Code have packaged instruction/skill installation. Other hosts need adapters for their tool discovery, identity, permissions, memory calls, and lifecycle. The experimental Codex guard currently exposes isolated plan reads and conditional writes. Broader MemQ workflows depend on the actual tools available in each connection. No universal plug-and-play support matrix has been established.

## How knowledge compounds

The useful unit is a selected lesson with evidence, not a full transcript. Preserve what happened, why the lesson applies, where the evidence lives, and when it should be rechecked. A successful reuse supplies new evidence; a contradiction can narrow or supersede the lesson.

This lets teams accumulate useful procedures and reduce repeated context setup. The magnitude of any improvement must be measured. It does not imply model-weight updates, inevitable accuracy gains, or unlimited memory growth. Retention, deletion, learning exclusions, and disclosure controls must be supported and tested by the configured service.

## Shared context with explicit boundaries

Cross-session continuity, same-team sharing, and cross-organization federation are separate capabilities. Agents may share context only when their authenticated scope and task authorization permit it. A global registry supports discovery; it does not make every realm's memory public. Another client's work never falls back to a broader account when its own connection is unavailable.

Handoffs carry the minimum useful projection: objective, current revision, completed work, remaining work, evidence references, and ownership state. A plan record is not a distributed lock. Federation additionally needs destination authentication, bounded grants, revocation checks, and receipts.

## Adoption sequence

Start with one supported host, one verified memory connection, and one bounded task. Verify persistence, exact read-back, stale-write rejection, wrong-scope rejection, interruption recovery, and available host controls. Then evaluate authorized handoffs before extending to team coordination or federation.

See [installation](INSTALL.md), [reusable infrastructure modules](HARNESS_MODULES.md), [memory workflows](MEMORY_WORKFLOWS.md), [MemQ contract](MEMQ_CONTRACT.md), [runtime integration](RUNTIME.md), [experimental host guard](MEMQ_ENFORCEMENT_CANDIDATE.md), and [acceptance criteria](ACCEPTANCE.md).
