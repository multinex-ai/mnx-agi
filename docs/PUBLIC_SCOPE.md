# Public package and private configuration

This repository publishes the portable MNX-AGI harness: operating rules, focused skills, installation and recovery, local realm configuration, public integration contracts, and independently testable host adapters. It is not the source of the hosted memory service or an internal product roadmap.

## Keep public

- Supported installation commands, prerequisites, upgrade and rollback behavior.
- The common Accord, configurable profiles, generic realm examples and offline validation.
- The published MemQ endpoint, supported connection workflow, identity checks and synthetic acceptance examples.
- Harness implementations, security boundaries, tests and honest compatibility limits needed to review and use this open-source package.

## Keep private

- Customer identities, account mappings, tenant IDs, real namespace bindings and deployment inventories.
- Organization-specific founder bindings, signatures, private policy content and amendment records.
- Credentials, installation backups, transcripts, memory exports, audit receipts and local project artifacts.
- Unreleased product plans, internal evaluation fixtures, backend topology, proprietary learning or routing extensions, and commercial strategy.

Keep private configuration outside the checkout and outside release staging. A gitignore entry alone does not protect an already tracked file. Use synthetic examples with reserved example domains. The release check rejects common credential formats, machine-specific paths, real tenant identifiers, non-example email addresses and private artifact paths; a maintainer must still review meaning and disclosure scope.

## What moved

The optional organization-bound pilot and internal delivery notes are no longer distributed by this public package. Their private maintenance and integration are separate from the supported harness installer. Stable installation, realm validation, memory planning and runtime contracts remain available. Consumers of the earlier experimental pilot imports must use their approved private extension; no production state or deployment is migrated automatically.

This cleanup limits the current source tree and future packages. Earlier public commits, forks, downloaded archives and caches may retain previously published material. It does not revoke the licenses of copies already distributed or establish retroactive confidentiality. No history rewrite is performed.

## Before every release

Run the public-content check, the test suite and package verification. Review the exact committed archive and its checksum before publication. Never build a release from a developer home directory, a private extension, or installation backups. See [release procedures](RELEASE.md).
