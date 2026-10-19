# Managed host enforcement

Status: preparation and acceptance tooling. **Not activated and not an OS security boundary.** The shipped installation still supplies guidance and an opt-in plan guard. Do not describe this document, a generated policy, or a passing unit test as a sealed installation.

## Deployment boundary

Mandatory operation requires a credential-bearing broker outside the agent's OS identity, protected executable dependencies, an administrator-owned realm registry, and restricted agent execution. The broker must authenticate the calling host and bind the task to an authorized realm; a caller-supplied directory or namespace is insufficient. Unknown realms and Galileo without its separately verified connection must fail closed. Do not put either account's credential in global host configuration or copy credentials between clients.

One user's unrestricted shell, alternate binaries, credential access, browser tools, and injected SDK tools can bypass an instruction or an ordinary MCP proxy. Host configuration must address each surface. For the strongest separation, run agent workloads in separate OS identities or isolated execution environments, with no provider credentials and no unmediated provider network access.

The experimental broker in `broker/` provides a separate credential-owning service and a macOS installer. Its default installation has no realm grants and does not activate host policies. See [broker installation](../broker/README.md). The policy preparation tool does not install or enroll that service. The current Codex-backed guard cannot simply be placed behind a strict MCP allowlist: its own upstream Codex process needs direct MemQ access, which the same allowlist would reject. Leaving an exception for that upstream in the agent's policy would reopen the bypass.

## Prepare, do not blindly install

Run the preparation tool with a new private output directory and the eventual administrator-controlled broker executable:

```sh
node tools/prepare-managed-hosts.mjs /private/staging/mnx-policy /opt/managed/mnx-memq-broker
```

This writes candidate Codex requirements, an exclusive Claude MCP set, a Claude settings fragment, and a content manifest. It does not install a broker, change the system, attest credentials, or activate the policies. The executable path is an input to review, not proof of ownership. Review the candidate against the exact client versions and the existing organization policy before activation.

The candidate disables direct app/plugin paths in supported Codex clients and permits only the exact broker invocation. Claude uses its exclusive managed MCP configuration and blocks the direct hosted MemQ endpoint. The network rules are additional restrictions, not an exhaustive machine firewall. Native/injected SDK tools, alternate network routes, and arbitrary programs require separate containment and tests.

Do not install the global exclusive MCP set before the broker supports the separately authorized Galileo route. It would also remove unrelated user-configured MCP tools. Preserve original bytes and effective organizational policy; never resolve a policy conflict by erasing another organization's constraints.

## Actual configuration sources

- Codex reads administrator requirements at `/etc/codex/requirements.toml`. Match the executable and full argument list. Account for higher-priority cloud or MDM requirements. Confirm the effective configuration in a fresh process, then try disallowed command-line overrides and a new MCP entry. See [Codex managed configuration](https://learn.chatgpt.com/docs/enterprise/managed-configuration).
- Claude Code uses `/Library/Application Support/ClaudeCode/managed-mcp.json` on macOS for an exclusive set. In-process SDK servers are an exception. See [Claude managed MCP](https://code.claude.com/docs/en/managed-mcp).
- Claude's existing server-managed settings can take precedence over local settings. Some locks merge across sources, but most settings are first-wins unless the highest-priority administrator source enables merging. Do not assume that dropping a local file activates every field. See [Claude managed settings](https://code.claude.com/docs/en/managed-settings).
- The configured executables, all dependencies, policy directories, realm registry, audit sink, and credential storage must be beyond the restricted agent's write access. `inspectProtectedPath` checks ownership, writable ancestors, and aliases as a preliminary local check; it does not replace ACL, executable-loading, or process-containment tests.

## Identity and account tests

For individual binding, configure the guard with `requirePrincipal: true` and `principal` equal to an immutable service-issued `access.authenticated_subject`. Missing or different subjects are rejected before private access. The current hosted handshake must actually provide this field before strict mode can operate. Do not substitute a browser email, organization ID, or a value supplied by the calling model.

Provision each test account independently. When using separate Codex homes, explicitly configure `mcp_oauth_credentials_store = "file"` in each isolated test home. A separate home with the default OS keyring is not evidence of separate identities. The adapter checks the effective store before starting an isolated client. Files remain private test credentials and must not be committed, exported, or treated as a production credential broker.

`tools/probe-account-isolation.mjs` accepts one private JSON configuration with `syntheticWritesAuthorized: true` and exactly two `clients`. Each client names `cwd`, `server`, `expectedNamespace`, and optionally `executable` and `codexHome`. The second client must have its independently provisioned home. The test verifies both handshakes before either write, creates only random synthetic plan records, tests both directions of foreign-namespace reads and writes, checks that both records are unchanged, and resumes them from fresh clients. Records remain in their own namespaces; no deletion or promotion is implied. A namespace mismatch aborts before test data access.

Two different namespaces test cross-organization isolation. They do not test two users in one organization. A second test with separately issued subjects inside the same organization is necessary for that claim. The current tool intentionally reports individual-user isolation as unverified.

## Activation gates

1. Observe broker and credential isolation under the final restricted OS identities; verify direct network and credential access fail.
2. Verify administrator-controlled host policies in both clients, without overriding existing organizational constraints or client account routing.
3. Verify both authorized success and unauthorized failure for the exact realm registry, including missing identity, changed identity, revoked credentials, malformed input, and service outage.
4. Attempt bypass via another MCP name, command arguments, user/project config, plugins, injected SDK servers, shell/network, browser/native tools, symlink, nested repository, and linked worktree.
5. Test new sessions, process/service restart, upgrade, rollback, stale writes, and unavailable audit storage. Preserve protected receipts outside the agent's writable paths.
6. Recheck Galileo's separate identity/namespace and test that Multinex is unavailable there, including tasks explicitly about Galileo from another working directory.

`auditEnforcement` exposes missing gates and keeps `systemSealed: false`: a local report cannot authenticate its own evidence or establish that every OS bypass is closed. Only observed deployment acceptance supports a narrower operational claim.
