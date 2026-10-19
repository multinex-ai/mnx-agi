#!/usr/bin/python3
"""Stage/install the broker only. Managed agent policy activation is separate."""
import argparse
import hashlib
import json
import os
import plistlib
import stat
import subprocess
import sys
import uuid
from pathlib import Path

ROOT = Path("/Library/Application Support/MNX-AGI")
STATE = Path("/var/db/mnx-memq")
SOCKET_DIR = Path("/var/db/mnx-memq-socket")
PLIST = Path("/Library/LaunchDaemons/ai.multinex.memq-broker.plist")
USER = "_mnx_memq"
LABEL = "ai.multinex.memq-broker"
FILES = ("memq_broker.py", "install_macos.py", "client", "policy.json", "service.plist")


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def command(*args):
    return subprocess.run(args, check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout


def safe_directory(path):
    for item in [path, *path.parents]:
        if not item.exists():
            continue
        st = item.lstat()
        # macOS /var is a system-owned link. All resolved targets are checked too.
        if item == Path("/var") and item.is_symlink() and st.st_uid == 0:
            continue
        if not stat.S_ISDIR(st.st_mode) or st.st_uid != 0 or st.st_mode & 0o022:
            raise RuntimeError("Unprotected installation directory: " + str(item))


def stage(output, policy_path):
    if output.exists():
        raise RuntimeError("Stage directory already exists")
    policy = json.loads(policy_path.read_text()) if policy_path else {"version": 1, "peers": {}, "realms": {}}
    policy.update(state_dir=str(STATE), socket=str(SOCKET_DIR / "broker.sock"))
    output.mkdir(mode=0o700)
    source = Path(__file__).with_name("memq_broker.py").read_bytes()
    client = ('#!/bin/sh\n[ "$#" -eq 0 ] || exit 64\nexec /usr/bin/env -i PATH=/usr/bin:/bin /usr/bin/python3 -I -B ' + "'" + str(ROOT / "broker/memq_broker.py") + "' --client\n").encode()
    plist = {"Label": LABEL, "ProgramArguments": ["/usr/bin/env", "-i", "PATH=/usr/bin:/bin", "/usr/bin/python3", "-I", "-B", str(ROOT / "broker/memq_broker.py"), "--serve", str(ROOT / "broker/policy.json")], "UserName": USER, "GroupName": "nobody", "RunAtLoad": True, "KeepAlive": True, "ProcessType": "Background", "Umask": 0o077, "StandardOutPath": "/dev/null", "StandardErrorPath": str(STATE / "service-error.log")}
    blobs = {"memq_broker.py": source, "install_macos.py": Path(__file__).read_bytes(), "client": client, "policy.json": (json.dumps(policy, indent=2) + "\n").encode(), "service.plist": plistlib.dumps(plist)}
    manifest = {"version": 1, "files": {name: digest(raw) for name, raw in blobs.items()}, "installsManagedPolicies": False}
    for name, raw in blobs.items():
        (output / name).write_bytes(raw)
        (output / name).chmod(0o600)
    raw = (json.dumps(manifest, sort_keys=True, indent=2) + "\n").encode()
    (output / "manifest.json").write_bytes(raw)
    print(json.dumps({"stage": str(output), "manifestSha256": digest(raw), "managedPoliciesActivated": False}))


def read_stage(directory, expected):
    raw = (directory / "manifest.json").read_bytes()
    if digest(raw) != expected:
        raise RuntimeError("Stage manifest digest changed")
    manifest = json.loads(raw)
    if manifest.get("version") != 1 or set(manifest.get("files", {})) != set(FILES):
        raise RuntimeError("Invalid manifest")
    blobs = {}
    for name in FILES:
        target = directory / name
        if target.is_symlink() or not target.is_file():
            raise RuntimeError("Invalid staged file")
        blobs[name] = target.read_bytes()
        if digest(blobs[name]) != manifest["files"][name]:
            raise RuntimeError("Staged file changed: " + name)
    return blobs, manifest


def install(directory, expected):
    if sys.platform != "darwin" or os.geteuid() != 0:
        raise RuntimeError("macOS administrator authentication required")
    blobs, manifest = read_stage(directory, expected)
    # Validate staged policy using its reviewed source, without starting service.
    policy = json.loads(blobs["policy.json"])
    if policy.get("state_dir") != str(STATE) or policy.get("socket") != str(SOCKET_DIR / "broker.sock"):
        raise RuntimeError("Unexpected service paths")
    if not isinstance(policy.get("peers"), dict) or not isinstance(policy.get("realms"), dict):
        raise RuntimeError("Invalid policy")
    for path in [ROOT, PLIST.parent, STATE.parent, SOCKET_DIR.parent]:
        safe_directory(path)
    # No overwrites until an explicit, reviewed upgrade path is implemented.
    if (ROOT / "broker").exists() or PLIST.exists():
        raise RuntimeError("Existing broker installation: preserve it and use a reviewed upgrade")
    if STATE.exists() or STATE.is_symlink() or SOCKET_DIR.exists() or SOCKET_DIR.is_symlink():
        raise RuntimeError("Existing service state paths: refusing to change their ownership")
    try:
        command("/usr/bin/dscl", ".", "-read", "/Users/" + USER)
    except subprocess.CalledProcessError:
        users = command("/usr/bin/dscl", ".", "-list", "/Users", "UniqueID")
        used = {int(line.rsplit(None, 1)[1]) for line in users.splitlines()}
        uid = next((value for value in range(499, 449, -1) if value not in used), None)
        if uid is None:
            raise RuntimeError("No unallocated service UID")
        command("/usr/bin/dscl", ".", "-create", "/Users/" + USER)
        for key, value in {"UniqueID": str(uid), "PrimaryGroupID": "-2", "NFSHomeDirectory": str(STATE), "UserShell": "/usr/bin/false", "IsHidden": "1", "AuthenticationAuthority": ";DisabledUser;", "RealName": "MNX MemQ credential broker"}.items():
            command("/usr/bin/dscl", ".", "-create", "/Users/" + USER, key, value)
    else:
        raise RuntimeError("Existing service account: refusing to reuse an unverified identity")
    uid = int(command("/usr/bin/id", "-u", USER).strip())
    if str(uid) in policy["peers"]:
        raise RuntimeError("Broker service identity must not be an agent identity")
    for path, owner, mode in [(ROOT, 0, 0o755), (ROOT / "broker", 0, 0o755), (ROOT / "bin", 0, 0o755), (STATE, uid, 0o700), (SOCKET_DIR, uid, 0o755)]:
        path.mkdir(mode=mode, parents=True, exist_ok=True)
        if path.is_symlink():
            raise RuntimeError("Refusing directory symlink")
        os.chown(path, owner, 0)
        path.chmod(mode)
    outputs = {ROOT / "broker/memq_broker.py": blobs["memq_broker.py"], ROOT / "broker/install_macos.py": blobs["install_macos.py"], ROOT / "broker/policy.json": blobs["policy.json"], ROOT / "bin/mnx-memq-broker": blobs["client"], PLIST: blobs["service.plist"]}
    for target, raw in outputs.items():
        with target.open("xb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.chown(target, 0, 0)
        target.chmod(0o755 if target.name == "mnx-memq-broker" else 0o644)
    receipt = {"manifest": manifest, "serviceUid": uid, "managedPoliciesActivated": False, "rollback": ["sudo launchctl bootout system/" + LABEL, "Remove only files listed in this installation receipt after verifying their digests. Retain credentials until a separate explicit revocation/deletion action."]}
    (ROOT / "broker/installation.json").write_text(json.dumps(receipt, indent=2) + "\n")
    os.chown(ROOT / "broker/installation.json", 0, 0)
    command("/bin/launchctl", "bootstrap", "system", str(PLIST))
    print(json.dumps({"installed": True, "serviceUid": uid, "managedPoliciesActivated": False}))


def rollback():
    if sys.platform != "darwin" or os.geteuid() != 0:
        raise RuntimeError("macOS administrator authentication required")
    safe_directory(ROOT)
    receipt = json.loads((ROOT / "broker/installation.json").read_text())
    targets = {"memq_broker.py": ROOT / "broker/memq_broker.py", "install_macos.py": ROOT / "broker/install_macos.py", "policy.json": ROOT / "broker/policy.json", "client": ROOT / "bin/mnx-memq-broker", "service.plist": PLIST}
    for name, target in targets.items():
        if target.is_symlink() or digest(target.read_bytes()) != receipt["manifest"]["files"][name]:
            raise RuntimeError("Installed files changed; inspect before rollback")
    # Stop before moving files. Preserve credentials and the disabled service
    # identity; those need a separate explicit revocation/deletion decision.
    command("/bin/launchctl", "bootout", "system/" + LABEL)
    backup = ROOT / "backups" / str(uuid.uuid4())
    backup.mkdir(parents=True, mode=0o700)
    for name, target in targets.items():
        target.rename(backup / name)
    (ROOT / "broker/installation.json").rename(backup / "installation.json")
    print(json.dumps({"rolledBack": True, "backup": str(backup), "credentialsPreserved": True}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--stage", type=Path)
    action.add_argument("--install", type=Path)
    action.add_argument("--rollback", action="store_true")
    parser.add_argument("--policy", type=Path)
    parser.add_argument("--expected-digest")
    args = parser.parse_args()
    try:
        if args.stage:
            stage(args.stage.resolve(), args.policy)
        elif args.rollback:
            rollback()
        elif not args.expected_digest:
            raise RuntimeError("Expected reviewed manifest digest is required")
        else:
            install(args.install.resolve(), args.expected_digest)
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else "Broker installation failed; inspect the protected partial installation before retrying", file=sys.stderr)
        sys.exit(1)
