---
name: mnx-harness-evaluate
description: Evaluate a proposed agent harness, skill, memory workflow, policy or routing change using representative tasks and failure scenarios. Use before widening adoption or claiming improved autonomy.
---

# Harness evaluate

This skill follows the active host instructions and authorized task.

Read [the acceptance suite](references/ACCEPTANCE.md). Define the behavior to improve, baseline, representative tasks, expected observable outputs and unacceptable outcomes. Keep completion criteria outside the agent's mutable narrative.

Use isolated synthetic realms and fixed fixtures for tests involving disclosure or federation. Do not run evaluations against production accounts or send private data to new providers without scope. Record model, harness, skill/policy revisions, tool schemas, task inputs and environment.

Measure task correctness, false completion, unauthorized actions, realm leakage, recovery success, context/tool usage, latency and cost. Include interruptions, stale ownership, missing memory, conflicting context, malformed classifier results and rejected grants where applicable. Repeat stochastic trials sufficiently for the decision; do not describe a single successful run as robust reliability.

Distinguish structural checks, offline contract tests, live adapter conformance and behavioral model evaluations. A well-formed SKILL.md does not prove good agent behavior, and schema-valid realm configuration does not prove access enforcement.

Compare the added complexity with a simpler workflow. Report evidence, failures, uncertainty and the precise adoption boundary. Fix demonstrated defects and rerun affected cases; do not keep adding universal rules from one anecdote.

Use [adaptive memory workflows](references/MEMORY_WORKFLOWS.md) for task-specific retrieval, stopping conditions, compaction, learning quality and performance evaluation.

Read [runtime verification](references/RUNTIME.md) when integrating a host adapter, probing search visibility, evaluating learning exclusion or testing grants. Keep local contract tests, live service checks and behavioral evaluations separate.
