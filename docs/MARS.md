# MARS and the MNX-AGI work cycle

MNX-AGI describes the work cycle in terms of orient, plan, act, verify and checkpoint. MARS implements one concrete, bounded version of the middle of that cycle as code.

| MNX-AGI step | MARS phase | What the code does |
| --- | --- | --- |
| Orient | PERCEIVE | Gather the task, constraints and context once. Fit context to a budget with `sliceContext`. |
| Plan | PLAN | Produce a plan. On a retry it sees every earlier attempt. |
| Act | EXECUTE | Run the plan. This is your function; MARS does not execute anything for you. |
| Verify | REFLECT | Grade the attempt S, A, B or F. An unrecognised grade counts as F. |
| Checkpoint | the result | `runLoop` returns every attempt and a status, ready to save. |

## The loop always closes

A weak grade sends the loop back to PLAN, but only while the attempt budget lasts. The default is 3 attempts and the hard cap is 10. When the budget runs out the loop returns `exhausted` with all attempts, so the caller decides what happens next. An abort signal stops it between phases. A phase that throws propagates its error.

Without a bound, a persistently weak grade would loop forever. The bound is the difference between a loop and a hang.

## Loops of loops

A loop's EXECUTE phase can run an entire inner loop and return its status as the output; the outer REFLECT then grades from that. Each level has its own bound, so nesting cannot run away. [`fleet.ts`](../mars/src/fleet.ts) covers the fan-out case: it runs tasks in dependency order, at most five at a time, cancels the dependents of anything that fails, and gives each task an abort signal that fires on timeout. Run a loop inside each task to nest further.

## Putting a boundary around it

The loop and scheduler decide what to do. They do not stop an agent from doing something else. To keep an agent inside a boundary, run it through the gate described in [Agent boundary](AGENT_BOUNDARY.md): execute the agent in `runSandboxed` and give it a `GateClient` as its only way to act.

## What changed from the earlier MARS repository

- The planning loop is now a small function with no model, graph library or vector store behind it. Callers supply the phases.
- The original loop had no attempt bound.
- The earlier VISA code did not enforce anything: the same process issued and checked its own tokens, the "clearance" was a caller-supplied argument, and one signature was a random string. It was removed and replaced by the gate described above.
- The hosted-gateway SDK, the local model controller and the local signal bus were not carried over.
- The scheduler's header described isolation, a circuit breaker and journaling that the code never did. It now says what it does.
