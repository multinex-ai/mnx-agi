# Cognitive delivery responsibilities

The canonical joint milestone plan and task registry are maintained in the MemQ repository at `docs/cognition/ROADMAP.md`, `docs/cognition/backlog.json`, and `docs/cognition/IMPLEMENTATION_BACKLOG.md`. Task IDs are stable across repositories. This file defines the harness share without duplicating the authoritative backlog.

## Current candidate

The opt-in local pilot consists of `src/genesis.mjs`, `src/cognitive-session.mjs`, the founding schema, and their tests. It is a bounded library: no model is selected, no agent is launched, no production founding manifest is signed, and installation does not activate cognition. See [pilot limits](COGNITIVE_PILOT.md).

The manifest included in a commit must describe that committed source and package version, rather than unrelated dirty files. Additional local broker/host changes are separately reviewable work, not implicit dependencies to include wholesale in a cognitive commit.

## Harness work by milestone

| Milestone | Harness responsibility | Required proof |
|---|---|---|
| M00 | Commit pilot, maintain exact manifest, run isolated cross-repo acceptance | Committed-tree package/tests and pairing receipt |
| M01 | Strict state/skill/invocation schemas; canonicalization; source-bound evaluator receipts | Cross-runtime fixtures, malformed state and capacity-before-dispatch tests |
| M02 | Founding identity, loaded Accord verification, amendments, current key/policy epoch | Approved real binding, revocation/recovery, no self-appointed authority |
| M03 | Consume scoped experience/belief/artifact contracts | Preserve provenance and exclusions rather than interpreting memory as policy |
| M04 | Action dispatch, fencing, budgets, cancellation and reconciliation | Lost-response and stale-worker cases do not produce duplicate side effects |
| M05 | Real model/tool adapters and narrow managed-host broker integration | Actual intended Codex/Claude host routes, capability and isolation receipts |
| M06 | Pass original source/query to approved profile adapters and consume canonical results | Native encoder identity and profile compatibility; no semantic claims from dimension alone |
| M07 | Sandboxed executable skills, qualified activation, host-observed environment | Real model-proposed acquisition, held-out transfer and old-skill retention |
| M08 | Execute bounded replay jobs under existing capabilities | Background work cannot widen permissions or compete without budget |
| M09 | Eligible model/tool routing, calibrated confidence and abstention | Equal-budget deterministic baseline; routing does not grant permission |
| M10 | Trace collection and paired scoring with pinned revisions | Independent outcomes and non-confounded trials |
| M11 | Versioned installation, host compatibility, rollback and release evidence | Existing user rules preserved; no return to a weaker authorization floor |
| M12 | Receive/export approved skills through explicit grants | Recipient verification, revocation and no imported constitutional authority |
| M13 | Optional training/controller adapters | Data rights, actual resource fit, model rollback and retention evidence |
| M14 | Optional functional mechanism experiments | No consciousness percentage or self-report optimization target |

## First task queue

M01-01 freezes the common contracts. M01-02 hardens founding canonicalization and pinned expectations. M01-03 validates complete persisted state and checks execution capacity before side effects. M01-04 freezes versioned MemQ interfaces. M01-05 binds evaluations to skill/task/environment artifacts and independent split authority. These local changes precede real enrollment and unattended execution.

Task owner roles are proposed responsibilities, not assignments or credentials. No background agents or recurring work are created by this document. No completion date is promised. The canonical backlog records estimated engineer-days and explicit dependencies.

## Commit and acceptance convention

Use task IDs in focused commits. Freeze schemas and task fixtures across repositories before paired integration tests. The MemQ integration test expects sibling `memq-private` and `mnx-agi` checkouts; CI should check out both at pinned revisions rather than silently testing a developer's dirty working copy.

Run the full Node suite and release validation for a candidate. The release manifest is built from the exact candidate tree. Package integrity, installation, authenticated service access, actual managed-host containment, and genuine task improvement are separate evidence classes.

Christopher Rijos remains the founding Supreme Architect within the adopting Multinex system. The live host hierarchy, organizational obligations, authenticated scope and current grants remain authoritative at execution. Galileo/Umbrage context is never routed through a Multinex fallback.
