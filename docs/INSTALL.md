# Installation and recovery

Use a reviewed tagged release and its published checksum. The CLI runs locally and never downloads code, contacts MemQ or changes host permission settings. Supported platforms are macOS and Linux with Node.js 22+. Windows is not supported by the shell launcher.

## Global installation

`node bin/mnx-agi.mjs init --global --hosts codex,claude`

Select only hosts you use; the default is Codex. The home directory defaults to the current OS user's home. `--dir PATH` can target an isolated test home. Non-default CODEX_HOME and CLAUDE_CONFIG_DIR installations require explicit manual host integration; do not assume the default paths are active there.

| Path under the selected home | Purpose |
|---|---|
| `.mnx-agi/package/` | Verified package copy |
| `.mnx-agi/install.json` | Managed file hashes and installation scope |
| `.mnx-agi/backups/` | Private pre-change contents for recovery |
| `.codex/AGENTS.md` | Codex global core block, preserving existing instructions |
| `.agents/skills/mnx-*/` | Codex skills |
| `.claude/CLAUDE.md` | Claude global core block, preserving existing instructions |
| `.claude/skills/mnx-*/` | Claude skills |
| `.local/bin/mnx-agi` | Local command launcher |

Codex's global AGENTS.override.md can shadow AGENTS.md, so installation refuses when that override exists. Keep account routing and other private local rules outside the managed block. Host-specific project rules and the host instruction hierarchy remain authoritative. The installer does not delete existing skills or change their invocation policies.

Discovery references: [Codex instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [Codex skills](https://learn.chatgpt.com/docs/build-skills), [Claude memory](https://code.claude.com/docs/en/memory), [Claude skills](https://code.claude.com/docs/en/skills).

## Project installation

`node bin/mnx-agi.mjs init --dir /path/to/project`

Creates a local package, AGENTS.md block, `.agents/skills/`, `.realm/realm.json` and `.realm/policy.md`. Existing realm configuration and local policy are preserved; validate and review them separately. This release supports AGENTS.md project installation and global Codex/Claude installation. It does not resolve a live realm registry or automatically merge parent policies.

Before committing, ignore `.mnx-agi/`, `.realm/state/`, `.realm/outbox/` and `.realm/evidence/` in the project's own ignore rules. Review configuration, paths and namespaces for disclosure. Backups may contain private instructions and must never be published. Creation uses private permissions on new files/directories and preserves modes on existing files; existing parent directory permissions are not hardened.

## Upgrade and rollback

Run `upgrade` from the **new, verified release**, using the original target and host set. `init` and `upgrade` share the same idempotent reconciler. No network update occurs, and neither command silently selects a newer version.

```sh
node bin/mnx-agi.mjs upgrade --global --hosts codex,claude --dry-run
node bin/mnx-agi.mjs upgrade --global --hosts codex,claude
~/.local/bin/mnx-agi verify --global
~/.local/bin/mnx-agi rollback --global --dry-run
~/.local/bin/mnx-agi rollback --global
```

Upgrade refuses modified managed files and blocks. Edit local rules outside the block. Rollback restores the last change and refuses to overwrite subsequent edits. A first-install rollback removes created files, including the launcher, but leaves empty directories and the private backup. An interrupted install retains a pending recovery pointer; run rollback from the downloaded release if the installed launcher is unavailable. Retain that release until verification succeeds.

Run only one installation/rollback operation per target at a time. Writes are atomic per file, not a filesystem-wide transaction. The installer detects observed intervening edits; it is not a defense against a malicious same-user process racing filesystem operations. Back up and protect your home directory separately. Backups are retained locally until you deliberately remove them under your retention policy.

`verify` checks managed content, not the behavior of an agent. `doctor` adds host-shadow and runtime-boundary reporting. Neither probes remote services. `validate FILE` checks configuration structure and semantic consistency, not actual filesystem containment, parent policy resolution, identity or grants.

## Codex and ChatGPT scope

Global Codex guidance is loaded from its active instruction chain; skills are available for relevant automatic selection. This is not an unconditional invocation on every message. Local filesystem installation does not establish installation in ChatGPT cloud chats, mobile, or workspace Skills. Those surfaces have separate lifecycle and access controls: see [OpenAI skill controls](https://learn.chatgpt.com/docs/enterprise/skills). The package does not change ChatGPT account settings or publish a ChatGPT plugin. Verify availability in the actual host session before claiming adoption.
