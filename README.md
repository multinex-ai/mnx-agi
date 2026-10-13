# MNX-AGI

A portable AI operating constitution with realm validation, focused memory skills, and reversible installation for Codex and Claude Code. MNX-AGI is the product name, not a claim of artificial general intelligence.

The core governs authorization, evidence, memory isolation, continuity and collaboration. It is technology agnostic: projects choose their models, languages, frameworks, tools and deployment workflows. Optional MemQ and decision-model integrations remain subject to verified capability and account scope.

## Install

Requires Node.js 22 or later on macOS or Linux. Obtain a tagged release from [GitHub Releases](https://github.com/multinex-ai/mnx-agi/releases), verify its SHA-256 checksum, extract it, and run these commands from the extracted directory:

```sh
node bin/mnx-agi.mjs verify-package
node bin/mnx-agi.mjs init --global --hosts codex,claude --dry-run
node bin/mnx-agi.mjs init --global --hosts codex,claude
node bin/mnx-agi.mjs doctor --global
```

Existing instructions are preserved outside a clearly marked managed block. Eight self-contained skills are installed for each selected host. The executable is placed at `~/.local/bin/mnx-agi`; use that path directly if it is not on your PATH. Start a new host session to load the updated global instructions. Skills are available when the host next refreshes its skill inventory.

For a project, run `node bin/mnx-agi.mjs init --dir /path/to/project`. This installs AGENTS.md guidance, skills and a customizable local-only `.realm` configuration. Review and ignore private project state before committing it. See [installation and recovery](docs/INSTALL.md).

## What is included

| Component | Status |
|---|---|
| [Core constitution](constitution/CORE.md) and optional profiles | Adoptable instructions, embedded in host instruction files |
| [Eight skills](docs/SKILLS.md) | Installed self-contained workflows; no automatic network activity |
| [Realm schema](schemas/realm.schema.json), examples and validator | Offline structure and consistency validation |
| Installation, upgrade, verification and rollback CLI | Local files, conflict detection, backups and integrity manifest |
| [Memory contract](docs/MEMQ_CONTRACT.md) | Capability and identity requirements for a connected service |
| [Federation architecture](docs/ARCHITECTURE.md) | Integration contract; requires an external gateway and authorization |
| [Research](docs/RESEARCH.md) and [acceptance criteria](docs/ACCEPTANCE.md) | Primary-source rationale and explicit implementation boundaries |

This package installs instructions and local validation. It does **not** install a security sandbox, authenticate MemQ, implement distributed locks, provision a federation gateway, or prove that an agent follows policy. `runtimeVerified: false` is intentional. Host permissions and service-side controls remain authoritative. Cross-client account isolation must be configured privately by the adopter.

## Adaptive memory planning

Use `node bin/mnx-agi.mjs memory-plan examples/memory-plan.json` to produce a bounded candidate workflow from available capability declarations and task signals. Read [adaptive memory workflows](docs/MEMORY_WORKFLOWS.md) for retrieval stopping rules, evidence quality and evaluation. The planner is offline and advisory; it does not authenticate or call MemQ.

## Develop and verify

```sh
npm test
npm run check
node bin/mnx-agi.mjs validate examples/local.realm.json
```

There are no runtime npm dependencies. After an intentional source change, run `node tools/build-skills.mjs` and `npm run manifest`, review the changed hashes, and rerun the checks. A matching manifest detects drift; its trust depends on obtaining the release through a trusted channel. It is not a cryptographic signature.

Licensed under [Apache-2.0](LICENSE). Security reporting and scope: [SECURITY.md](SECURITY.md). Release procedures: [docs/RELEASE.md](docs/RELEASE.md).
