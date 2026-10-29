# Experimental MemQ credential broker

This component separates provider credentials from agent processes. It is a deployment candidate; installing it alone does not make Codex or Claude mandatory or close all system bypasses.

The Python standard-library service runs as a dedicated macOS service user. A root-owned policy maps each permitted OS user ID to one fixed realm, OAuth subject, organization namespace and plan prefix. Unix peer credentials come from the kernel. Agent requests cannot select another account, realm or namespace. The service checks the live OAuth identity before each plan read or conditional write and writes a redacted dispatch receipt before sending it upstream.

No existing Codex or Claude credential is imported. Enrollment uses a separate OAuth authorization with PKCE, state and a bounded loopback listener. Tokens remain in the service's private state directory and are never returned by its client interface. The provider must expose `access.authenticated_subject` for strict binding; an organization ID or browser email is insufficient.

## Stage and inspect

Requires macOS, `/usr/bin/python3` with Python 3.9 or later, and a reviewed package. First run the focused tests:

```sh
npm run test:broker
python3 -B broker/install_macos.py --stage /private/tmp/mnx-broker-stage
```

Choose a new staging directory. Inspect its files and the printed manifest SHA-256. The default policy has no peers or realms. For an installation policy, `--policy FILE` takes a private deployment configuration; no real account identifiers belong in the public repository.

An administrator installs the exact reviewed stage:

```sh
sudo /usr/bin/env -i PATH=/usr/bin:/bin /usr/bin/python3 -I -B /private/tmp/mnx-broker-stage/install_macos.py --install /private/tmp/mnx-broker-stage --expected-digest REVIEWED_MANIFEST_SHA256
```

Enter the password only at the operating system's local prompt. Installation creates root-owned code under `/Library/Application Support/MNX-AGI`, a disabled login service account, private state under `/var/db/mnx-memq`, a peer-authenticated socket, and a launch daemon. It refuses existing installation/state paths and existing service identities instead of silently taking ownership. If interrupted, inspect partial state before retrying.

## Enroll only after identity and policy are ready

A reviewed nonempty policy must already bind the intended immutable subject and namespace. A root operator can then run the installed Python program with `--login REALM`; it prints an authorization URL and login ID, never a token. `--login-status ID` returns the enrollment result. Keep these enrollment outputs private. Check the status and an authorized synthetic operation before treating the connection as ready. Do not weaken subject checks when the hosted provider has not yet shipped the identity field.

The initial empty installation is deliberately unusable by agents. This version does not implement a general in-place upgrade, automatic realm provisioning or managed host activation. Changes to installed root-owned policy require a separately reviewed administrative change and service restart. Do not map an unrestricted desktop user to multiple projects or trust a model-supplied working directory as the isolation boundary.

## Host acceptance and recovery

See [managed host enforcement](../docs/MANAGED_HOST_ENFORCEMENT.md). Restrict the entire agent execution environment, protect its executable dependencies and prevent direct credential/network paths. Codex and Claude policy files are additional controls; shell-only sandboxing and ordinary MCP allowlists do not cover every native or injected tool.

Test correct-scope success, forged peer/realm/namespace rejection, changed/missing subjects, stale writes, account switching, credential rotation, audit failure, service restart, unsupported tools and direct-provider bypass attempts. Keep separate project accounts separate, including linked worktrees and tasks targeting another project from a different directory.

Rollback with the installed `install_macos.py --rollback` requires an administrator and unchanged installed file digests. It stops the daemon and preserves credentials and the disabled service account; rollback is not provider token revocation or credential deletion. Review the receipt before cleanup. Do not claim a sealed system from unit tests or an installation receipt.
