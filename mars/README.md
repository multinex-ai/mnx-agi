# MARS

Small, tested building blocks for running agents in bounded loops and keeping them inside a boundary. MARS is part of
[MNX-AGI](../README.md).

Status: developer preview. Everything listed below has tests; nothing here is a hosted service or a model runtime.

## What is here

| Path                                           | What it gives you                                                                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/loop.ts`](src/loop.ts)                   | The PERCEIVE, PLAN, EXECUTE, REFLECT loop with a hard attempt bound. Loops nest.                                                          |
| [`src/context_slice.ts`](src/context_slice.ts) | Fit context blocks to a token budget, in order.                                                                                           |
| [`src/fleet.ts`](src/fleet.ts)                 | A dependency-aware scheduler for fan-out work: graph validation, bounded waves, per-task timeouts.                                        |
| [`src/visa`](src/visa)                         | A gate, signed permits and a sandbox launcher that enforce what an agent can reach. See [the boundary design](../docs/AGENT_BOUNDARY.md). |
| [`mnx-sync`](mnx-sync/README.md)               | A Rust tool that renders one rules source into `AGENTS.md`, `CLAUDE.md` and `GEMINI.md`.                                                  |

How the loop relates to the MNX-AGI work cycle is in [MARS and the MNX-AGI work cycle](../docs/MARS.md).

## What is not here

The hosted MemQ service, model runtimes, an identity ledger, and any customer or commercial code. MARS makes no model
calls and ships no default endpoint.

## Run it

Deno 2.x for the library, Rust (stable) for `mnx-sync`.

```bash
cd mars
deno task test      # needs --allow-run for the sandbox tests; the task sets what it needs
deno task check
deno task lint
deno task fmt

cd mnx-sync
cargo test
```

The loop, slicer and scheduler tests run with no permissions at all.

## Licensing

Code that came from the original MARS repository (`src/fleet.ts`, `src/log.ts`) is MIT; see [LICENSE-MIT](LICENSE-MIT).
Everything else under `mars/`, including `src/loop.ts`, `src/context_slice.ts`, `src/visa` and `mnx-sync`, is Apache-2.0
under the repository [LICENSE](../LICENSE).
