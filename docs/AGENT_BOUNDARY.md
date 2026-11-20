# Agent boundary: the VISA gate

A signed permit does not box in an agent by itself. A boundary exists only when three things hold together:

1. The agent has no way to act except through one checkpoint.
2. That checkpoint is a separate process that decides, using keys the agent does not hold.
3. Every decision leaves a record the agent cannot quietly edit.

MARS ships all three as small, tested parts in [`mars/src/visa`](../mars/src/visa). "VISA" here means one thing: a short-lived, signed permit that names an agent, a gate, and the exact actions and resources allowed. It is not an identity ledger and not a trust network. Nothing in this package depends on a hosted service.

## The parts

| Part | Runs where | Holds |
| --- | --- | --- |
| `VisaIssuer` | Operator process | The issuer private key. Never in the agent's process. |
| `Gate` | A separate process from the agent | Pinned issuer public keys and the only handlers that can act. |
| `GateClient` | Inside the agent | The agent's own key and its VISA. No authority beyond them. |
| `runSandboxed` | Operator process | Starts the agent with runtime permissions for one network address and nothing else. |

## What the gate checks, in order

Every request is refused unless all of these pass. Each refusal has a code, and each one is recorded.

1. **Issuer.** The VISA was signed by a key the gate pinned (`unknown_issuer`, `bad_signature`).
2. **Audience and time.** The VISA names this gate, is inside its validity window, and is not longer-lived than the gate allows (`wrong_audience`, `not_yet_valid`, `expired`, `lifetime_too_long`).
3. **Revocation.** Neither the VISA nor the agent has been revoked (`revoked`).
4. **Proof of possession.** The request is signed by the key the VISA is bound to, and is bound to this exact VISA (`bad_request_signature`, `token_binding_mismatch`). A stolen VISA is useless without the agent's key.
5. **Freshness.** The request is recent and its nonce has not been seen (`stale_request`, `replay`). If the replay cache is full of live entries the gate refuses rather than skipping the check (`replay_cache_full`).
6. **Scope.** A grant covers the exact action and a resource matching its pattern, within its size and call budgets (`not_granted`, `payload_too_large`, `budget_exhausted`). Resources containing `..`, empty segments, backslashes or a leading `/` never match.
7. **Handler.** The action has a handler the gate was given (`unknown_action`). A handler error is reported only as `handler_error`, with no detail.

Anything the checks do not recognise is a refusal. Garbage input never throws.

## What stops what

- Forging or widening a VISA: the issuer signature covers the claims.
- Reusing a VISA at another gate: the audience is part of the signed claims and of the request.
- Replaying a captured request: nonce cache, plus a short freshness window.
- Stealing a VISA: requests must also be signed by the agent's key.
- Reaching other files, hosts, processes or secrets from the agent: the sandbox grants none, and the runtime enforces it. A refused operation fails immediately instead of prompting.
- Doing something the gate does not offer: the agent can only ask for actions that have handlers.
- Denying or editing history: every allow and deny is appended to a hash chain; editing, removing or reordering an entry breaks verification from that point.

## Deployment shape

```
operator process                     agent (sandboxed child)
  VisaIssuer ── issues VISA ───────►  holds VISA + its own key
  Gate  ◄──── signed request ──────── GateClient
    └─ handlers: the only way anything happens
```

Name resources after the boundary you want to enforce, for example `realm/<id>/memory/read` or `tool/search/query`. A grant such as `{ action: "read", resource: "realm/alpha/*" }` then cannot reach `realm/beta`. This lines up with the realm isolation rules in [constitution/CORE.md](../constitution/CORE.md).

## Limits to know before relying on it

- The sandbox is the Deno permission model. It is a policy boundary inside one runtime, enforced by that runtime. It does not defend against a bug in the runtime itself. For untrusted code, also run the child in a container or OS sandbox.
- The gate and the agent must be different processes, ideally different users. If the agent can reach the gate's memory or the issuer's key, the boundary is gone.
- Replay, revocation and budget state live in the gate's memory and reset when it restarts. Keep VISA lifetimes short (the issuer default is 15 minutes) and persist revocations yourself if you need them to survive a restart.
- The audit chain detects tampering; it does not prevent it. Ship entries to storage the gate's host cannot rewrite.
- The agent can do anything its own grants allow. Scope is the control, so keep grants narrow and avoid the `*` resource (the issuer refuses it unless you opt in).
- Handlers are trusted code. A handler that does too much defeats a narrow grant.
- Clocks matter. The gate allows 30 seconds of skew for VISA times and 60 seconds for request freshness.
- Passing the agent its key and VISA through environment variables means the agent can read them. That is intended: they are the agent's own credentials.

## Verifying it

```bash
cd mars
deno task test
```

The suite includes a test that starts a deliberately hostile agent inside the sandbox. It tries to read and write files, read the environment, start a process, reach another host and another port, open a listener and import remote code, and every attempt must be refused. The same agent then calls the gate with out-of-scope, wrong-action and path-traversal requests, which must be refused, and one in-scope request, which must succeed. Each check in the gate and each sandbox flag has a test that fails if that check or flag is removed.
