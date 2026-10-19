# MemQ host integration candidate

Status: implemented adapter and live-test harness; **not a sealed system installation**. This does not change the constitution's version or the installed package doctor's `runtimeVerified` result.

The first integration exposes only `plan_read` and `plan_write`. It uses a fixed organization namespace and plan-ID prefix, checks the workspace's canonical path and Git common directory against denied roots, performs a fresh MemQ handshake before each operation, requires conditional writes, and withholds results with a different namespace or plan ID. Unknown tools and arguments are denied. An unavailable audit sink prevents dispatch. Requests are not automatically retried, including ambiguous writes.

The provider connection is Codex's supported app-server MCP interface using its existing OAuth client. The adapter never reads or exports OAuth credentials. No agent turn or model inference is needed for the acceptance probe. Child app-server configuration disables known unrelated MCP connections. The host launcher must separately disable direct upstream access. Codex merges server configuration: declaring one server does not remove other configured servers.

The handshake currently provides an organization namespace and authentication source, not a verifiable user-email subject. This establishes organization scope, not per-user isolation within that organization. Namespace selection and prefixes are not backend ACLs. A trusted host must bind the task's declared ownership; path checks cannot infer that prose in an otherwise permitted workspace concerns another client.

## Local candidate configuration

Store private configuration outside the public package and keep it readable only by its operator. Required fields:

```json
{
  "workspace": "/srv/example-project",
  "deniedRoots": ["/srv/separate-client"],
  "namespace": "org:replace-with-verified-organization",
  "planPrefix": "mnx-example-",
  "server": "memq_multinex",
  "codexExecutable": "/usr/local/bin/codex",
  "auditPath": "/var/tmp/example-private-audit.jsonl"
}
```

The supported upstream is pinned to the hosted MemQ MCP endpoint. Run `bin/mnx-memq-guard.mjs` with the private configuration path as its only argument. Its stdio is reserved for MCP messages. Keep the working directory inside the configured workspace; do not force an unrelated client task into this directory to obtain access.

The local candidate launcher is opt-in, uses a read-only Codex sandbox and disables known direct MCP entries. It is not an administrator-managed profile. A separate desktop session does not inherit the launcher's configuration. Installed plugins, alternate executables, same-user file changes, and changed command-line arguments remain potential bypasses until constrained by the host.

## Acceptance

Run unit tests with `npm test`. Run the live probe only with authorization to create a synthetic plan in the configured account:

```sh
node tools/probe-memq-host.mjs /absolute/path/to/candidate-launcher /srv/example-project mnx-example-unique-probe-id
```

The probe starts a real Codex app-server host, inventories its MCP tools, rejects a direct upstream call, writes a synthetic plan with expected version zero, reads it back, attempts a stale write and scope overrides, then verifies unchanged state. Use a fresh plan ID for each run. Synthetic plans remain in the provider; the adapter does not expose deletion. Passing this probe proves the tested host route, not universal OS isolation or a clean-machine installation.

Repeat the command with the same plan ID and `--resume-only` to verify exact retrieval from a newly started host process without repeating the write. The configured workspace must resolve to the same Git repository as the calling directory; nested repositories do not inherit its memory binding. Launchers must preserve the actual working directory rather than force every invocation into an allowed project.

## Required before default activation

1. Put the broker, configuration, runtime binaries and host requirements under administrator control, beyond the agent's writable filesystem. Define the OS user/service boundary and ownership explicitly.
2. Keep OAuth and provider access out of the agent's direct reach. A same-user process with unrestricted shell/network or credential-store access can bypass a proxy. Split the credential-bearing service from the restricted agent host and test that separation.
3. Apply managed MCP allowlisting, sandbox/approval constraints, filesystem exclusions, and network controls. Constrain apps, plugins, browser/computer use, Docker sockets, and alternate tool transports as well. Verify effective policy in a fresh process; do not rely on user-editable command-line defaults.
4. Obtain a server-verifiable subject if individual-user enforcement is required. Test two independently authenticated, authorized fixture accounts without copying credentials. A fabricated namespace denial is not a complete two-account acceptance test.
5. Test fail-closed behavior for lost OAuth, changed account, policy tampering, service restart, timeout, audit failure, linked worktrees, path aliases and direct access attempts from the restricted agent process. Test fresh installation and rollback on a clean machine.

Until these checks pass, keep system enforcement false, preserve existing defaults, and do not deploy this integration to client/team/federated workflows.

Codex supports administrator-owned requirements and MCP identity allowlists. Its documented pre-tool hooks can fail open on errors or timeout, so they are not the sole authorization barrier. See [managed configuration](https://learn.chatgpt.com/docs/enterprise/managed-configuration) and [permissions](https://learn.chatgpt.com/docs/permissions). This adapter was exercised against Codex CLI 0.158.0; future protocol changes require renewed integration acceptance.
