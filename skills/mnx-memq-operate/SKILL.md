---
name: mnx-memq-operate
description: Verify, diagnose, and recover a configured MemQ connection or credential broker without bypassing account, host, or audit controls.
---

# Operate MemQ

Use this workflow for connection setup checks, authentication failures, missing tools, namespace mismatches, interrupted writes, broker health, and upgrades. Follow the active task and [MemQ contract](references/MEMQ_CONTRACT.md).

Resolve the explicit project, current directory, repository ownership, and expected realm first. Discover the tools actually exposed by this host. A strict broker may expose only plan operations; a broader upstream catalog does not authorize reaching around it.

Inspect redacted host status and deployment receipts. Perform the permitted identity handshake before private access, matching the service, immutable subject, namespace, and required authentication source. A successful browser login, connection name, email label, healthy process, or organization namespace alone is insufficient for individual identity.

Classify failures before recovery: missing login, identity mismatch, unavailable transport, missing capability, stale version, uncertain write outcome, audit outage, or retrieval indexing delay. Stop protected operations on identity mismatch. Check a known operation or exact record after an uncertain write; never repeat a mutation just because its response was lost. Use bounded retries for eligible reads only.

Keep credentials inside the host's approved secret facility or separate broker. Never read, print, export, copy, or embed a token, password, cookie, or credential file. Separate test homes must use independently provisioned credential stores. Do not switch account, disable a guard, enable a raw connection, widen a namespace, or override a managed policy to obtain a successful test.

Administrator enrollment and policy installation require the authorized operator's workflow. Prepare a concrete versioned candidate, redacted diagnostics, rollback path, and proportional tests before asking for a missing privileged step. Do not request a password in chat. Preserve existing organization policies and unrelated project configuration.

Verify recovery with an authorized synthetic record: correct-account success, wrong-account refusal, stale-write rejection, exact read-back, and fresh-session resume. Report installed, connected, tested, and enforced states separately, including the precise host and capability boundary. Follow [runtime verification](references/RUNTIME.md); do not turn a successful diagnostic into a system-wide enforcement claim.

Use [the tool coverage map](references/MEMQ_TOOL_COVERAGE.md) to select among currently exposed capabilities. Installed skills do not grant access to tools withheld by the host.
