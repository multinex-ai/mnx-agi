# Start with one host and one memory connection

Install the harness, verify that your host loads it, then connect MemQ for the project that needs continuity. The installer uses Node's built-in libraries; there is no `npm install` step and no model API key is required to install the package.

## 1. Download and verify a stable release

Requirements: macOS or Linux, Node.js 22 or later, `curl`, `tar`, and either `sha256sum` or `shasum`. This example pins v1.3.0. The experimental adapter is included in the archive but remains a separately configured integration.

```sh
version=1.3.0
work_dir="$(mktemp -d)" || exit 1
cd "$work_dir" || exit 1
release_url="https://github.com/multinex-ai/mnx-agi/releases/download/v$version"

curl --fail --location --remote-name "$release_url/mnx-agi-$version.tar.gz" || exit 1
curl --fail --location --remote-name "$release_url/SHA256SUMS" || exit 1

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum --check SHA256SUMS || exit 1
else
  shasum -a 256 --check SHA256SUMS || exit 1
fi

tar -xzf "mnx-agi-$version.tar.gz" || exit 1
cd "mnx-agi-$version" || exit 1
node bin/mnx-agi.mjs verify-package || exit 1
```

Continue only after checksum and package verification succeed. Keep the extracted directory until installation and recovery checks are complete.

## 2. Install into the hosts you use

For Codex and Claude Code:

```sh
node bin/mnx-agi.mjs init --global --hosts codex,claude --dry-run
node bin/mnx-agi.mjs init --global --hosts codex,claude
node bin/mnx-agi.mjs doctor --global
```

Use `--hosts codex` or `--hosts claude` to install just one host. Review the dry-run output before applying it. The installer preserves instructions outside its managed block, makes a private backup, and refuses conflicting changes. Resolve a reported conflict using [installation and recovery](INSTALL.md); do not erase existing account-routing instructions.

Expected result: `ok: true` for local verification, eight installed skills per selected host, and `runtimeVerified: false`. That last value is expected: installation makes the operating guidance available, while service authentication and runtime enforcement require separate checks.

Start a fresh session in the selected host and check that the MNX core and relevant skills are available. Custom `CODEX_HOME` or `CLAUDE_CONFIG_DIR` locations require manual integration as described in the installation guide. ChatGPT cloud chats are a separate installation surface.

## 3. Connect the project's approved MemQ account

Configure MemQ in your host's supported MCP connection settings. The hosted endpoint is:

```text
https://mcp.multinex.ai/mcp/v1
```

Use the project's intended account and its approved authentication method. Keep credentials in the host's credential facility. Connect each client project to its own approved account and namespace; a connection label alone does not establish identity.

In the new session, ask the agent to:

> Resolve this project's approved memory connection. Discover its live tools, run the identity and namespace handshake, and confirm the scope before accessing private memory. If the identity is unavailable or differs from the intended account, stop memory access and report the mismatch.

Follow [the MemQ contract](MEMQ_CONTRACT.md). Available tool names, permissions, and capabilities depend on the actual connection; the package does not authenticate the service for you.

## 4. Verify continuity before relying on it

Use a small synthetic task with a unique identifier:

1. Save a permitted test fact or progress checkpoint and retain its returned identifier.
2. Read it back through a supported exact-read operation and compare the saved value.
3. Open a new session, repeat the scope handshake, and retrieve the same record.
4. Confirm the scope, current task revision, and next action before resuming work.

Test another compatible host only after the first host succeeds, using the same authorized scope. Check retrieval and identity independently in both hosts. Search indexing can lag behind persistence; reconcile the known record before repeating a write. Synthetic test records remain subject to the provider's retention and deletion capabilities.

The experimental Codex plan gateway has its own [configuration and acceptance probe](MEMQ_ENFORCEMENT_CANDIDATE.md). Broad recall, learning, and federation are not exposed by that narrow gateway. A memory connection test does not establish system-wide enforcement.

If you plan to change embedding models, use the [vector-translation guide](VECTOR_TRANSLATION.md) to validate the proposed profiles and retrieval quality. A successful dimension conversion is a separate check from a successful memory query.

## 5. Keep operation bounded and recoverable

Recall what changes the next decision. Verify the outcome. Save selected lessons and meaningful checkpoints. Recheck stale context at resumption. Use the [pairing guide](MEMQ_PAIRING.md) for the recurring workflow and the [acceptance criteria](ACCEPTANCE.md) before expanding to shared mutation or federation.

To inspect or reverse the local installation:

```sh
~/.local/bin/mnx-agi verify --global
~/.local/bin/mnx-agi rollback --global --dry-run
~/.local/bin/mnx-agi rollback --global
```

A first-install rollback removes the installed launcher. If it is unavailable, run `node bin/mnx-agi.mjs rollback --global` from the retained extracted release. Rollback does not delete remote MemQ records or change the host's account settings.
