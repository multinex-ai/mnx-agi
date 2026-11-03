# First-run Accord configuration

MNX-AGI installs operating guidance and focused skills into supported hosts. First-run setup lets you review the common Accord, choose local preferences and record which exact core you adopted. Account routing, organizational rules and the host's actual permissions remain authoritative.

## Review, adopt and verify

From a verified release directory:

```sh
node bin/mnx-agi.mjs verify-package
node bin/mnx-agi.mjs setup --global --hosts codex,claude --dry-run
```

Read `constitution/CORE.md` and the selected profile under `profiles/`. Without `--accept-accord`, setup is always a preview and creates no target files. It does not claim that you read or approved the policy.

After review, adopt the core and install local-only defaults:

```sh
node bin/mnx-agi.mjs setup --global --hosts codex,claude --accept-accord
node bin/mnx-agi.mjs doctor --global
```

Use `--hosts codex` or `--hosts claude` for one host. Omit `--global` and use `--dir /path/to/project` for a project installation. `--dir` can also target an isolated home when testing global setup. Start a fresh host session after installation.

The private `.mnx-agi/accord.json` stores preferences, selected hosts, the exact core digest, adoption state and acceptance time. Newly created files use private permissions. Setup preserves instructions outside its managed block, makes a local recovery snapshot, and never contacts a model or memory service. Keep the configuration and backups out of version control.

## Optional private preferences

Create a JSON file **outside the repository**. Omitted fields use the defaults shown:

```json
{
  "profile": "portable",
  "stack": "project",
  "memory": {
    "adapter": "local",
    "mode": "local",
    "onUnavailable": "local-only"
  },
  "excludedProjectRefs": []
}
```

`profile` is `portable` or `multinex`. `stack` is `project` (use established project choices) or `rust-typescript` (a local preference for suitable new system components). These preferences do not override a project's hard constraints. `excludedProjectRefs` contains local policy references for projects requiring separate treatment; references are not filesystem containment or access controls.

For a declared MemQ workflow, replace the memory object with:

```json
{
  "adapter": "memq",
  "mode": "preferred",
  "onUnavailable": "local-only",
  "connectionRef": "approved-memory-connection",
  "identityRef": "private-project-identity",
  "expectedNamespace": "org:example"
}
```

Use an authoritative private namespace binding in your local file; do not infer it from an organization label. `required` memory mode must use `pause-dependent`. Missing optional memory can permit unrelated local work. Missing or mismatched identity always blocks private memory access.

```sh
node bin/mnx-agi.mjs setup --global --hosts codex,claude --config /path/to/private-preferences.json --accept-accord --dry-run
node bin/mnx-agi.mjs setup --global --hosts codex,claude --config /path/to/private-preferences.json --accept-accord
```

Only references and preferences belong in this file. Tokens, passwords, unknown fields and permissive required-memory fallbacks are rejected. Credentials stay in the selected host's supported secret facility or separately enrolled broker. Summary output does not print stored identity or namespace references.

Project `.realm/realm.json` and project-local account rules remain separate and are preserved. A global preference does not override the active project's realm or grant it access to a remote namespace. Configure and validate the relevant realm and host adapter before protected operations.

## How this pairs with MemQ

1. Configure the intended MemQ connection in the actual host through supported OAuth sign-in.
2. Resolve project ownership, then verify the returned service, principal, effective namespace and project binding.
3. Write one authorized synthetic checkpoint, read it back exactly, and retrieve it in a fresh session.
4. Test a second compatible host and account-boundary denials before relying on shared continuity.

The public endpoint and detailed workflow are in [the quickstart](QUICKSTART.md). A successful setup returns `memoryVerified: false`, `enforcementVerified: false` and `runtimeVerified: false`: configuration is a declaration, not service authentication or runtime enforcement.

## Change, upgrade and recover

Repeated setup with the same core and preferences preserves the original acceptance timestamp. An ordinary `init` or `upgrade` preserves existing preferences and adoption. If the core changes, `doctor` reports `review-required`; review the new core before adopting it.

Changing an accepted configuration requires explicit replacement:

```sh
node bin/mnx-agi.mjs setup --global --hosts codex,claude --config /path/to/reviewed-preferences.json --accept-accord --replace-configuration --dry-run
node bin/mnx-agi.mjs setup --global --hosts codex,claude --config /path/to/reviewed-preferences.json --accept-accord --replace-configuration
node bin/mnx-agi.mjs rollback --global --dry-run
```

Replacement is backed up with the rest of the installation and is reversible while later edits remain unchanged. Legacy `init` remains supported and creates a pending adoption record. See [installation and recovery](INSTALL.md) for conflict handling and rollback limitations.
