# Changelog

## 1.4.0-rc.1 (prerelease)

- Adds optional strict authenticated-subject binding to the MemQ plan guard. Missing subject evidence fails closed; current namespace-only handshakes do not satisfy this mode.
- Keeps explicitly isolated Codex clients on their own effective OAuth file store, rather than assuming a new home separates OS-keyring credentials.
- Adds a live two-account synthetic isolation probe, administrator-policy preparation, and a read-only enforcement readiness audit. Policy preparation does not activate system-wide enforcement.
- Documents managed-policy precedence, injected-tool exceptions, protected runtime dependencies, and remaining activation gates for Codex and Claude.

- Adds an experimental credential-owning broker with kernel-verified peer identities, strict OAuth subject checks, bounded callbacks, redacted audit, and a deny-by-default macOS service installer. It remains a deployment candidate, not a claim of mandatory host enforcement.
- Installs eleven self-contained skills, including new operational diagnostics, selected-source ingestion, and memory lifecycle workflows. Adds explicit tool-family coverage and capability limits.

## 1.3.0

- Presents MNX-AGI as a Recursive Agent Harness paired with MemQ, with Multinex branding, live repository badges, a benefit-led pairing guide, and a verified installation quickstart.
- Documents vector-translation interfaces and distinguishes dimension adaptation from demonstrated semantic retrieval compatibility.
- Includes an opt-in experimental Codex-to-MemQ plan gateway and live host acceptance probe. The default installation remains guidance and local validation; system-wide enforcement is not claimed.
- Strengthens project-switch context rules and rejects nested-repository memory inheritance and unresolved Git ownership in the experimental guard.
- Preserves private account-routing instructions during upgrade. Global installation targets Codex and Claude Code; ChatGPT cloud installation remains separate.

## 1.2.1

- Rechecks authorization and transfer expiry after an asynchronous audit write, so audit latency cannot extend a permission window. Adds a regression test for the delayed-audit case.


## 1.2.0

- Adds an opt-in provider-neutral operation boundary with per-call identity/policy checks, conditional-update requirements, bounded federation grants and payload-free receipts. Host wiring and backend enforcement remain external.
- Adds bounded exact-read/search visibility polling without mutation retries.
- Adds paired evaluation scoring with safety gates, trace requirements and explicit non-approval of adoption.
- Tests synthetic scope failures, stale authorization, ambiguous outcomes, federation expiry/revocation/replay, audit failures and retrieval delay.
- Clarifies Codex versus ChatGPT installation scope, learning-exclusion verification and embedding provenance.


## 1.1.0

- Adds an offline, budgeted memory-workflow planner with fail-closed planning on unknown or mismatched scope and explicit execution gates.
- Adds task-specific retrieval, stopping, checkpoint, contradiction-handling and evidence-based learning workflows.
- Expands four skills with self-contained adaptive memory references and adds planner regression tests.
- Defines behavioral comparison criteria without claiming live MemQ access or measured intelligence gains.

## 1.0.0

First public MNX-AGI operating baseline.

- Replaces framework, language and provider mandates with a portable core and optional profiles.
- Separates instructions, configuration validation and actual runtime enforcement.
- Defines fail-closed account binding for private memory, bounded cross-realm grants, evidence-based learning and verified ownership requirements.
- Ships eight self-contained skills for realm context, recall, checkpoints, coordination, learning, federation, decision routing and harness evaluation.
- Adds a zero-dependency local CLI for installation, upgrade, verification, diagnostics and rollback, preserving unrelated host instructions.
- Adds strict realm JSON validation, package integrity manifests, disclosure/link checks and a Linux/macOS CI matrix.
- Keeps remote MemQ, registry, federation and decision-model adapters external and inactive until their acceptance gates pass.

The realm integration schema remains `mnx-agi/v0.1`; its version is independent of the package release. This release does not modify host sandbox or tool-permission settings.
