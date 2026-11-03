# Isolated Codex and Claude workspaces on macOS

The experimental `broker/isolated_host.py` installer provisions a dedicated non-administrator OS identity, a new empty workspace, root-owned copies of the selected native Codex and Claude executables, and a whole-process filesystem sandbox. Children inherit the same sandbox. It installs the packaged skills without copying any credentials or source projects.

This provides a bounded managed CLI integration. It does not automatically enclose an already-running desktop app, other ordinary CLI launches, or a cloud agent. Administrators and the machine owner remain able to change the installation. Network access remains available for model authentication and inference; the credential broker and its fixed UID binding protect MemQ access. This is not an outbound network firewall.

## Prepare and install

Run the stage command as the ordinary operator, using a new private directory and the actual reviewed native executable paths:

```sh
python3 -B broker/isolated_host.py --stage /private/tmp/mnx-host-stage --name example --package /path/to/mnx-agi --codex /path/to/codex --claude /path/to/claude
```

Inspect the staged executable hashes, installer, skill archive and manifest. The manifest digest pins the exact files; the binaries are installed locally, not published as part of this package. Then an administrator runs:

```sh
sudo /usr/bin/env -i PATH=/usr/bin:/bin /usr/bin/python3 -I -B /private/tmp/mnx-host-stage/host.py --install /private/tmp/mnx-host-stage --expected-digest REVIEWED_MANIFEST_SHA256
```

The installer refuses existing hosts, homes, identities and launchers. It validates all archive contents and destination collisions before provisioning. On interruption, inspect the partial installation; do not delete or take over existing state automatically.

## Bind and enroll

The resulting OS UID has no MemQ grant initially. Add it to an independently reviewed root-owned broker policy with one fixed realm, authenticated subject, namespace and plan prefix. Use the broker's digest-checked `--configure` operation. Provision broker OAuth independently and verify the subject before activating it. Unknown or mismatched identities stay denied.

Use a different managed identity for a different project ownership boundary. An excluded client project must use its separately verified account binding; if that binding is absent, access stays denied. A directory name, copied checkout or prompt is not a trusted remote account selector. Never map an unrestricted desktop administrator to the broker as a convenience.

## Launch and verify

Launchers are installed at `/Library/Application Support/MNX-AGI/bin/mnx-example-codex` and `mnx-example-claude`. They use `sudo -u` to enter the fixed non-administrator identity, clear inherited environment variables, set that identity's home and configuration paths, and execute the root-owned CLI under the fixed sandbox profile. The operator may need to authenticate locally to launch; the workload itself is not an administrator.

Each model host requires its own authorized sign-in in this new home. Codex is explicitly configured to use its private file credential store. Do not copy tokens from another home or read credentials to troubleshoot. Verify native CLI startup, tool inventory, correct-scope read/write, fresh-session resume, and denied foreign workspace, symlink and child-process access. Test actual account isolation separately from mocked fixtures.

The normal global skill installer remains reversible and independent. Global exclusive MCP policy activation needs separate effective-policy and excluded-project compatibility checks. An installed launcher is not proof of all-system enforcement; report the exact tested process boundary.
