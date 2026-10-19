# Reusable agent infrastructure

MNX-AGI packages an operating discipline that can travel across compatible agents and hosts. Paired with MemQ, it connects a bounded work cycle to persistent knowledge. Its modular adoption path is the product: use the existing host, choose suitable models, connect permitted tools, and retain the verified context that makes future work easier to resume.

## Current package and integration boundaries

| Infrastructure concern | Available in this repository | Boundary |
|---|---|---|
| Repeatable agent work | Core lifecycle, eight focused skills, memory planner, and evaluation scorer | The host executes the work; the planner and scorer do not run an autonomous agent loop |
| Persistent context | MemQ capability contract and recall, checkpoint, and learning workflows | Requires a configured connection with verified scope; no local memory database is bundled |
| Vector interoperability | Provider-neutral source/target profile contracts for the configured MemQ service | Translation availability and retrieval quality must be verified per profile; the narrow Codex gateway does not expose translation |
| Scoped tool operations | Optional runtime checks and an experimental Codex-to-MemQ plan gateway | System-wide enforcement and individual-principal isolation remain separate acceptance requirements |
| Coordinated work | Ownership, revision, checkpoint, and handoff rules | A live scheduler, distributed lock service, shared blackboard, and agent spawner are not bundled |
| Model choice | Provider-neutral core and a bounded decision-routing skill | The deployment supplies model clients, routing implementation, and approved fallback destinations |
| Learning that compounds | Evidence-linked lessons, independent reuse, supersession rules, and paired evaluation | No model training or guaranteed performance uplift; improvements require observed evidence |
| Graceful degradation | Bounded memory budgets, capability checks, local-progress rules, and recovery guidance | Automatic hardware discovery and hardware-tier selection are not implemented here |

## Follow-on module candidates

These are explicit integration opportunities, not claims about the current package:

- **Typed event delivery:** validated messages, traceable delivery, priority handling, bounded queues, and defined retry behavior. A production event bus needs ordering, failure, and load tests.
- **Execution coordination:** task ownership, cancellation, leases and fencing, checkpoint references, and handoff acknowledgement. A saved plan alone does not provide these guarantees.
- **Model routing and resilience:** choose among eligible models using capability, data permissions, cost, latency, and observed health. Circuit breakers and failover must preserve the same disclosure boundary.
- **Resource-aware operation:** discover available runtime resources and adjust local/remote execution or memory budgets without silently expanding access. Hardware detection needs platform-specific implementation and validation.
- **Domain workflows:** compose collection, retrieval, analysis, verification, and human approval for a concrete business task. Autonomous deployment or revenue-generation claims require their own demonstrated workflow.

## What to prove first

The next adoption gate remains one verified memory connection and one enforceable host integration. Then test an authorized handoff between two agents, followed by different supported model hosts using the same scoped knowledge. Measure recovery correctness, repeated context setup, repeated failures, latency, cost, and unintended disclosure.

Keep the core small and make additional infrastructure independently installable and testable. Existing orchestration frameworks can supply runtime services while MNX-AGI defines the operating discipline and MemQ supplies scoped memory. See [the pairing guide](MEMQ_PAIRING.md), [architecture](ARCHITECTURE.md), and [acceptance criteria](ACCEPTANCE.md).
