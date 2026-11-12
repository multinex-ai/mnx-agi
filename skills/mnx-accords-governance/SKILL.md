---
name: mnx-accords-governance
description: Execute under the Multinex & Umbrage Accords (v4.1 / MNX-AGI v1.4) with concise evidence-based communication, Plan-Ahead Confirmation Gates, MemQ closed-loop context discipline, Rust + Deno/Node TypeScript constitutional stack over Python, and the v2.1 Interactive Report Presentation Standard (unlabeled ELI16 default, high visual/SVG diagram density, and Dark/Light mode).
---

# MNX Accords Governance, Runtime & Report Presentation (`mnx-accords-governance`)

Use this skill whenever executing multi-step engineering, architecture, MemQ memory operations, system configuration work, or interactive HTML report/tracker authoring across Codex, Claude Code, and Antigravity.

## 1. Concise communication
Use ordinary prose for conversation, plans, progress updates and checkpoints. Do not require or automatically prepend an Accordboard, status board, banner, or Thinking Trace. When useful, briefly explain the scope, evidence, uncertainty and next action. Provide concise decision rationale, not private internal reasoning. Keep MemQ routing, identity checks, evidence tracking and applicable HTML report standards in effect.

## 2. Plan-Ahead Confirmation Gate & Ouroboros Loop
- **Plan Ahead:** Present a numbered plan (files, commands, side effects, rollback) and wait for user confirmation before mutating global host configs (`~/.codex`, `~/.claude`, `~/.gemini`, `~/.agents`, `~/.mnx-agi`), running destructive actions, or posting externally (GitHub, Jira, Confluence, Slack).
- **Ouroboros Narrowing:** Locate objective in dependency graph -> narrow to single next unblocked item -> execute -> verify with independent evidence -> record concise progress -> re-narrow.

## 3. Progress communication
Use ordinary prose for responses, plans, progress updates and checkpoints. Do not prepend a mandatory status board or banner. Distinguish proposed, implemented, tested, deployed and observed results clearly; use status labels only when useful.

## 4. MemQ Closed-Loop Workflow (`PERCEIVE -> PLAN -> EXECUTE -> VERIFY -> CHECKPOINT -> RESUME`)
1. **Resolve & Handshake:** Verify `cwd`, target project, and Git common-dir (`git rev-parse --git-common-dir`). Run live `reunion` / `namespace_info` before private reads or writes.
2. **Compact Context (`memq-compact-context`):** Read `context_read` / `plan_state_read` first (~1,200 token soft initial budget; ~3,000 token hard cap).
3. **Conditional Checkpoints (`memq-operations`):** Write `checkpoint_write` / `plan_state_write` with `expected_state_version` (CAS) at phase transitions and read back to verify persistence.

## 5. Constitutional Stack (`Rust` + `Deno / Node TypeScript` over Python)
- **System-Level Default (`MUST` Prefer Rust & TypeScript over Python):** Use **Deno / Node TypeScript** (`deno.json` / `package.json`, `.ts` / `.mjs`) and **Rust** (`Cargo.toml`) as the mandatory default languages by specification for all system-level scripts, CLI utilities, automation, report/artifact tooling, daemons, harnesses, and programs.
- **Rust (`Cargo.toml`):** Mandatory for agent harnesses, local orchestrators, privilege brokers, UNIX socket servers, process supervisors, and OS/hardware FFI (`CoreGraphics`, `ApplicationServices`, `getpeereid`, `flock`).
- **Deno / Node TypeScript (`deno.json` / `tsconfig.json`):** Mandatory for system-level scripts, CLI/build utilities, backend/edge services, MCP gateways, vector topology services, and governance/evaluation tooling.
- **Python Exception (`Project-Local Only`):** Do NOT author new system-level scripts or programs in Python (`.py`) over TypeScript or Rust unless Python (`pyproject.toml`, `requirements.txt`, existing `.py` codebase, or ML runtime) is already the established de facto language and existing style in the specific project being worked on.

## 6. Interactive Report & Tracker Standard (`REPORT-PRESENTATION v2.1`)
- Follow [REPORT_PRESENTATION.md](references/REPORT_PRESENTATION.md) for all substantial HTML reports, architecture briefs, roadmaps, and trackers.
- **Implicit ELI16 Explanation Default (`MUST NOT` Label):** Write explanations at an intelligent, concrete ELI16 level by default without ever printing `"ELI16"` or `"ELI10"` labels in the rendered document.
- **Dark Mode / Light Mode Parity (`MUST`):** Support seamless Dark Mode and Light Mode switching via `color-scheme: light dark`, `light-dark()` neutral tokens, and an interactive `Dark` / `Light` / `System` toggle in the sticky HUD.
- **High Visual & SVG Diagram Density (`MUST`):** Include multiple rendered inline SVG diagrams—(1) Interactive SVG System Topology with trust-boundary enclosures and directional connectors, (2) SVG Sequence Swimlane / Offline Failure-Recovery State Machine, (3) Visual SVG Growth Funnels & Telemetry Charts, and (4) Visual Milestone/Gate Dependency Pipelines.
