#!/usr/bin/python3
"""Provision a dedicated macOS CLI workspace; never import user credentials."""
import argparse
import hashlib
import io
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import uuid
import zipfile
from pathlib import Path

ROOT = Path("/Library/Application Support/MNX-AGI")
HOMES = Path("/var/db/mnx-agents")


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def name_ok(name):
    if not re.fullmatch(r"[a-z][a-z0-9-]{0,19}", name):
        raise RuntimeError("Invalid managed workspace name")
    return name


def protected(path):
    canonical = path.resolve(strict=True)
    if canonical != path and not (str(path).startswith("/var/") and str(canonical) == "/private" + str(path)):
        raise RuntimeError("Aliased protected path")
    for item in [canonical, *canonical.parents]:
        info = item.lstat()
        if info.st_uid != 0 or info.st_mode & 0o022:
            raise RuntimeError("Unprotected managed host path")


def profile(home, package):
    # The full host and its children inherit this filesystem boundary. Network
    # remains available for model login/inference; MemQ credentials stay in the
    # separate broker and are never supplied to this identity.
    roots = ["/System/Library", "/System/Cryptexes/OS/usr/lib", "/usr/bin", "/usr/lib", "/usr/share", "/usr/libexec", "/bin", "/sbin", "/private/etc", "/Library/Apple", "/Library/Developer/CommandLineTools", str(home.resolve()), str(package.resolve())]
    reads = "\n".join("(allow file-read* (subpath " + json.dumps(p) + "))" for p in roots)
    services = ["com.apple.system.logger", "com.apple.trustd.agent", "com.apple.networkd", "com.apple.SystemConfiguration.configd", "com.apple.system.opendirectoryd.libinfo", "com.apple.system.opendirectoryd.membership"]
    mach = "\n".join("(allow mach-lookup (global-name " + json.dumps(service) + "))" for service in services)
    broker_files = "\n".join("(allow file-read* (literal " + json.dumps(str(p)) + "))" for p in [ROOT / "bin/mnx-memq-broker", ROOT / "broker/memq_broker.py"])
    return '(version 1)\n(deny default)\n(allow process*)\n(allow sysctl-read)\n(allow network*)\n(allow file-read* (literal "/"))\n' + mach + '\n' + reads + '\n' + broker_files + '\n(allow file-read* (subpath "/dev"))\n(allow file-write* (literal "/dev/null") (literal "/dev/tty"))\n(allow file-write* (subpath ' + json.dumps(str(home.resolve())) + '))\n'


def stage(output, name, package, codex, claude):
    name_ok(name)
    if output.exists():
        raise RuntimeError("Stage already exists")
    release = json.loads((package / "release-manifest.json").read_text())
    entries = release["files"]
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
        for entry in entries:
            relative = entry["path"]
            if not (relative.startswith("skills/") or relative == "constitution/CORE.md"):
                continue
            source = package / relative
            if source.is_symlink() or ".." in Path(relative).parts:
                raise RuntimeError("Unsafe package entry")
            raw = source.read_bytes()
            if digest(raw) != entry["sha256"]:
                raise RuntimeError("Package drift")
            z.writestr(relative, raw)
    output.mkdir(mode=0o700)
    blobs = {"host.py": Path(__file__).read_bytes(), "skills.zip": archive.getvalue(), "codex": codex.resolve().read_bytes(), "claude": claude.resolve().read_bytes()}
    manifest = {"version": 1, "name": name, "files": {key: digest(raw) for key, raw in blobs.items()}}
    for key, raw in blobs.items():
        (output / key).write_bytes(raw)
        (output / key).chmod(0o600)
    raw = (json.dumps(manifest, sort_keys=True, indent=2) + "\n").encode()
    (output / "manifest.json").write_bytes(raw)
    print(json.dumps({"stage": str(output), "manifestSha256": digest(raw), "credentialsCopied": False}))


def install(directory, expected):
    if sys.platform != "darwin" or os.geteuid() != 0:
        raise RuntimeError("macOS administrator authentication required")
    raw = (directory / "manifest.json").read_bytes()
    if digest(raw) != expected:
        raise RuntimeError("Stage digest changed")
    manifest = json.loads(raw)
    name = name_ok(manifest["name"])
    if manifest.get("version") != 1 or set(manifest["files"]) != {"host.py", "skills.zip", "codex", "claude"}:
        raise RuntimeError("Invalid host manifest")
    blobs = {}
    for key, expected_hash in manifest["files"].items():
        p = directory / key
        if p.is_symlink() or not p.is_file():
            raise RuntimeError("Unsafe staged file")
        blobs[key] = p.read_bytes()
        if digest(blobs[key]) != expected_hash:
            raise RuntimeError("Staged file changed")
    archive = zipfile.ZipFile(io.BytesIO(blobs["skills.zip"]))
    contents = {}
    if len(archive.infolist()) > 500 or sum(x.file_size for x in archive.infolist()) > 16_000_000:
        raise RuntimeError("Skill archive exceeds limits")
    for entry in archive.infolist():
        if not re.fullmatch(r"(?:constitution/CORE\.md|skills/mnx-[a-z-]+/(?:SKILL\.md|references/[A-Z_]+\.md))", entry.filename) or entry.file_size > 1_000_000 or entry.filename in contents or stat.S_ISLNK(entry.external_attr >> 16):
            raise RuntimeError("Unsafe skill archive")
        contents[entry.filename] = archive.read(entry)
        contents[entry.filename].decode("utf-8")
    if not contents.get("constitution/CORE.md") or not any(p.endswith("/SKILL.md") for p in contents):
        raise RuntimeError("Required instructions or skills absent")
    account = "_mnx_agent_" + name.replace("-", "_")
    target, home = ROOT / "hosts" / name, HOMES / name
    protected(ROOT)
    protected(ROOT / "bin")
    protected(Path("/var/db"))
    launchers = {host: ROOT / "bin" / ("mnx-" + name + "-" + host) for host in ["codex", "claude"]}
    if any(p.exists() or p.is_symlink() for p in launchers.values()):
        raise RuntimeError("Launcher already exists")
    if target.exists() or target.is_symlink() or home.exists() or home.is_symlink():
        raise RuntimeError("Managed host already exists; reviewed upgrade required")
    if subprocess.run(["/usr/bin/id", "-u", account], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        raise RuntimeError("Managed OS identity already exists")
    users = subprocess.check_output(["/usr/bin/dscl", ".", "-list", "/Users", "UniqueID"], text=True)
    used = {int(line.rsplit(None, 1)[1]) for line in users.splitlines()}
    uid = next((n for n in range(449, 399, -1) if n not in used), None)
    if uid is None:
        raise RuntimeError("No free managed UID")
    for parent in [ROOT / "hosts", HOMES]:
        if not parent.exists():
            parent.mkdir(mode=0o755)
        protected(parent)
        parent.chmod(0o755)
    target.mkdir(mode=0o755)
    target.chmod(0o755)
    for key in ["host.py", "codex", "claude"]:
        (target / key).write_bytes(blobs[key])
        (target / key).chmod(0o755 if key != "host.py" else 0o644)
    for relative, data in contents.items():
        p = target / "package" / relative
        p.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
        for parent in [p.parent, *p.parent.parents]:
            if parent == target:
                break
            parent.chmod(0o755)
        p.write_bytes(data)
        p.chmod(0o644)
    record = "/Users/" + account
    subprocess.run(["/usr/bin/dscl", ".", "-create", record], check=True)
    for key, value in {"UniqueID": str(uid), "PrimaryGroupID": "-2", "NFSHomeDirectory": str(home), "UserShell": "/usr/bin/false", "IsHidden": "1", "AuthenticationAuthority": ";DisabledUser;"}.items():
        subprocess.run(["/usr/bin/dscl", ".", "-create", record, key, value], check=True)
    home.mkdir(mode=0o700)
    os.chown(home, uid, -1)
    for child in ["workspace", "tmp", ".codex", ".claude", ".agents"]:
        p = home / child
        p.mkdir(mode=0o700)
        os.chown(p, uid, -1)
    core = (target / "package/constitution/CORE.md").read_text()
    for dest in [home / ".codex/AGENTS.md", home / ".claude/CLAUDE.md", home / "workspace/AGENTS.md"]:
        dest.write_text(core + "\nUse only this managed workspace and its configured credential broker. Another project requires its own operator-selected managed identity.\n")
        dest.chmod(0o600)
        os.chown(dest, uid, -1)
    for dest in [home / ".agents/skills", home / ".claude/skills"]:
        dest.symlink_to(target / "package/skills")
    broker = str(ROOT / "bin/mnx-memq-broker")
    (home / ".codex/config.toml").write_text('cli_auth_credentials_store = "file"\nmcp_oauth_credentials_store = "file"\n[features]\napps = false\nplugins = false\n[mcp_servers.mnx_memq_guard]\ncommand = ' + json.dumps(broker) + '\nargs = []\n')
    (home / ".claude/.claude.json").write_text(json.dumps({"mcpServers": {"mnx_memq_guard": {"type": "stdio", "command": broker, "args": []}}}))
    for p in [home / ".codex/config.toml", home / ".claude/.claude.json"]:
        p.chmod(0o600)
        os.chown(p, uid, -1)
    (target / "sandbox.sb").write_text(profile(home, target))
    config = {"name": name, "uid": uid, "account": account, "home": str(home), "manifest": manifest, "credentialEnrollmentRequired": True}
    (target / "host.json").write_text(json.dumps(config, indent=2) + "\n")
    for p in [target / "sandbox.sb", target / "host.json"]:
        p.chmod(0o644)
    for host in ["codex", "claude"]:
        launcher = launchers[host]
        with launcher.open("x") as stream:
            stream.write("#!/bin/sh\nexec /usr/bin/sudo -u " + account + " /usr/bin/env -i PATH=/usr/bin:/bin /usr/bin/python3 -I -B '" + str(target / "host.py") + "' --launch " + name + " " + host + ' "$@"\n')
        launcher.chmod(0o755)
    print(json.dumps({"installed": True, "name": name, "uid": uid, "workspace": str(home / "workspace"), "credentialsCopied": False, "brokerBindingRequired": True, "globalPoliciesActivated": False}))


def launch(name, host, arguments):
    name_ok(name)
    if host not in ("codex", "claude"):
        raise RuntimeError("Unsupported host")
    target = ROOT / "hosts" / name
    for item in [target / "host.json", target / "sandbox.sb", target / host, target / "host.py"]:
        protected(item)
    config = json.loads((target / "host.json").read_text())
    if os.getuid() != config["uid"]:
        raise RuntimeError("Wrong managed execution identity")
    home = Path(config["home"])
    os.chdir(home / "workspace")
    os.environ.clear()
    os.environ.update(HOME=str(home), TMPDIR=str(home / "tmp"), PATH="/usr/bin:/bin", CODEX_HOME=str(home / ".codex"), CLAUDE_CONFIG_DIR=str(home / ".claude"), TERM="xterm-256color")
    os.execv("/usr/bin/sandbox-exec", ["sandbox-exec", "-f", str(target / "sandbox.sb"), str(target / host), *arguments])


if __name__ == "__main__":
    if len(sys.argv) >= 4 and sys.argv[1] == "--launch":
        try:
            launch(sys.argv[2], sys.argv[3], sys.argv[4:])
        except Exception as error:
            print(str(error) if isinstance(error, RuntimeError) else "Managed host launch failed", file=sys.stderr)
            sys.exit(1)
        sys.exit(0)
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", type=Path)
    parser.add_argument("--install", type=Path)
    parser.add_argument("--expected-digest")
    parser.add_argument("--name")
    parser.add_argument("--package", type=Path)
    parser.add_argument("--codex", type=Path)
    parser.add_argument("--claude", type=Path)
    parser.add_argument("--launch", nargs=2)
    args, extra = parser.parse_known_args()
    try:
        if args.stage and not extra:
            stage(args.stage, args.name, args.package, args.codex, args.claude)
        elif args.install and args.expected_digest and not extra:
            install(args.install, args.expected_digest)
        elif args.launch:
            launch(args.launch[0], args.launch[1], extra)
        else:
            raise RuntimeError("Invalid managed host arguments")
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else "Managed host operation failed; inspect any partial installation before retrying", file=sys.stderr)
        sys.exit(1)
