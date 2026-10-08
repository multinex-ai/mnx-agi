# Security policy

MNX-AGI is an instruction and local configuration package. Host sandboxes, tool permissions, identity providers and service authorization enforce access. Policy text, local namespaces and skill names do not provide isolation on their own.

For suspected vulnerabilities, use the repository's private vulnerability reporting feature when available. If private reporting is unavailable, contact an organization maintainer through an established private channel before sharing sensitive details. Never post credentials, client names, private realms, transcripts or exploit payloads containing production data in a public issue.

Supported release line: 1.x. Validate downloaded release checksums and review source changes before installing. Integrity manifests are unsigned and detect accidental drift; they do not protect against an attacker who can replace both files and manifest. Protect local installation metadata and backups with the same care as host configuration.

The installer rejects symlink destinations and path traversal, preserves unrelated instructions, and refuses conflicting content. It assumes a trusted local account and serialized installation. It does not protect against a malicious process running as the same OS user. Backups can contain private data and are never appropriate release artifacts.

No telemetry, automatic updates, credential collection or remote memory calls are implemented by the CLI. Remote adapters must satisfy the identity, authorization and behavioral gates in docs/ACCEPTANCE.md before use with private data.
