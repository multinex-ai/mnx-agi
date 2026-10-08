---
name: mnx-decision-routing
description: Design or use a bounded decision route among eligible skills, tools or models, optionally using Jev. Use when explicit choices can replace an unnecessary general-purpose model call.
---

# Decision routing

This skill follows the active host instructions and authorized task.

Read [the research](references/RESEARCH.md) and apply [CORE](references/CORE.md). First perform deterministic validation and remove candidates that fail permission, availability, budget, data-destination or task-scope requirements.

If rules already determine the result, use them. Otherwise offer the decision model a finite set of eligible choices plus an explicit abstain/escalate option. Minimize input context and use the deployed API schema. Jev is optional; do not assume it is installed or substitute undocumented request fields.

Validate the returned structure and ensure the choice was offered. Compare confidence against thresholds calibrated on this task class, not copied from a vendor example. Handle ambiguity, malformed output, timeout and distribution shift. Fall back only to an already-approved model/data destination, or return the decision to the calling agent/human when needed.

Record model/version, candidate set, input reference, selected result, uncertainty and downstream observed outcome without leaking payloads. Recheck authorization at execution time: routing cannot create permission. Never make the classifier the sole export, deletion, policy-amendment or completion authority.

When introducing a route, evaluate quality and abstention against deterministic and general-model baselines before enabling it broadly. Provider claims about speed and cost are hypotheses until measured on the actual workflow.
