# Research informing MNX-AGI

Reviewed 2026-10-05; Jev and host installation sources rechecked 2026-10-08. The recommendations below are MNX-AGI design decisions drawn from primary documentation, not evidence that the corresponding integrations are already implemented. Vendor performance claims are not acceptance results for MNX-AGI.

| Primary source | Finding | MNX-AGI decision |
|---|---|---|
| [LangChain on Jev and LangGraph, September 25, 2026](https://www.langchain.com/blog/building-prod-with-jev-and-langgraph) | Jev is a TypeSafe decision model returning typed judgments and probabilities; LangGraph combines model decisions with explicit workflow state. | Add an optional bounded-decision adapter. Keep general reasoning and execution separate from classification. |
| [LangChain on building a harness with Jev, September 17, 2026](https://www.langchain.com/blog/building-a-harness-with-jev) | A decision model can take selected classification/routing work out of the general agent loop. | Evaluate skill routing and duplicate-candidate screening before expanding its responsibilities. |
| [TypeSafe workflow guide](https://docs.typesafe.ai/concepts/how-to-build-with-system-one) | Keep exact computation in code; constrain semantic decisions to supplied options. | Use deterministic validation and authorization first. Evaluate abstention, ambiguity, and task-specific thresholds for probabilistic routing. |
| [Deep Agents architecture](https://github.com/langchain-ai/deepagents/blob/main/libs/ARCHITECTURE.md) | The harness uses middleware, backends, and profiles above LangChain's loop and LangGraph's runtime. | Define portable adapter boundaries instead of requiring one harness. Differentiate tool visibility, actual capability, and permission. |
| [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence) | Checkpointers support short-term execution state; stores support longer-term memory. | Runtime checkpoints are authoritative for execution; MemQ retains selected cross-session knowledge and references to checkpoints. |
| [Anthropic long-running harness design](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) | Durable progress artifacts, incremental work, and explicit acceptance checks address context resets and premature completion. | Store acceptance state and next action outside the conversation. Verify before marking complete; make delegation optional. |
| [Agent Skills specification](https://agentskills.io/specification) | Skills have discoverable metadata, loadable instructions, and optional supporting resources. | Use small workflow-specific skills; load detail when relevant. Treat skill declarations as guidance, never as actual permission grants. |
| [MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) | Tools are discoverable with schemas; tool metadata must be interpreted within the connection's trust context. | Discover the actual MemQ contract and validate results. Do not assume a tool name proves behavior or health. |
| [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) | HTTP authorization and protected-resource discovery concern access to specific services. | Bind identity and grants to the intended service and namespace. Keep credentials outside memory and handoff payloads. |
| [A2A specification](https://a2a-protocol.org/latest/specification/) | Agent cards advertise interfaces and skills; servers remain responsible for authorization and task visibility. | Keep peer discovery separate from trust. Reauthorize handoffs and result retrieval; an agent card is not a grant. |

## Jev placement

Jev is not a LangChain-owned all-in-one language model. It is developed by TypeSafe and integrated into examples in the LangChain ecosystem. The useful pattern is a typed decision component within a larger harness.

Initial experiments: choose among already-permitted skill candidates, classify a task for routing, flag a likely memory duplicate for review, or propose whether additional context is needed. Always include an abstain/escalate path. Revalidate output against the offered candidates, evaluate probability calibration on representative tasks, and keep an evidence trail for the selected route.

Do not use a model probability as the sole permission check, privacy release decision, proof of completion, memory deletion command, or policy amendment. Model fallback also needs an approved data destination; uncertainty must not silently send private context to a different provider. These are MNX-AGI constraints, not claims about Jev's built-in enforcement.

Do not copy published benchmark multipliers or example thresholds into global policy. Compare the proposed route with deterministic rules and a general LLM on the same fixtures, including ambiguity, malformed responses, timeout, prompt injection, and drift.

## Evidence boundary

The linked sources inform design choices. Runtime capabilities must be checked against the tools and authorization of each deployment; a documentation claim is not evidence of an active connection.
