---
name: mnx-memq-compact
description: Resume ongoing work with one compact MemQ checkpoint and targeted evidence, reducing repeated context and measuring token and cost savings.
---

# Compact task memory

Use for resumed tasks, repeated investigations or long work where prior decisions affect the next action. Skip memory for self-contained tasks. Follow project account-routing rules and verify the authenticated identity and realm before private access. A project switch invalidates cached context; never use another account to recover missing memory.

Start with the unresolved question and a known task/plan ID. Prefer `context_read` when the configured broker exposes it. It returns only a compact checkpoint, not full plan state. Retain its `state_version`; within the same verified scope, send `known_version` to avoid receiving unchanged text. If the tool is unavailable, use a bounded supported lookup; do not bypass the broker.

Budget roughly 1,200 retrieved tokens initially and 3,000 before reconsidering the query. These are soft workflow targets, not invented API parameters or exact byte-to-token conversions. Expand one source only when it resolves a named uncertainty. Stop once the next action is supported or two expansions add no useful evidence. Prefer artifact paths, immutable revisions and evidence references over copying whole files, manuals or transcripts.

Keep one task checkpoint with objective, acceptance criteria, completed work, next actions, blockers, constraints, pending side effects, evidence references and artifact revisions. Use `checkpoint_write` with the last observed version. After a write acknowledgement, read back and compare the checkpoint before claiming persistence. A lost response or version conflict requires reconciliation, not an automatic retry. Never drop unresolved obligations to fit a size limit.

Use fresh authoritative state for deployments, identity, permissions and other volatile facts. A checkpoint avoids repeating discovery; it does not replace required verification. Keep credentials, private reasoning and unrelated project context out of saved memory.

The evaluation target is at least 30% lower **whole-task AI tokens and combined AI/memory cost** with no loss of correctness, recovery or isolation. Count every call, including retrieval and retries. Use host-reported input/output tokens and actual costs, record memory cost separately, and compare matched tasks with the same model and settings. Missing measurements mean unverified savings. Synthetic text-size reductions are not measured model-token or cost savings.
