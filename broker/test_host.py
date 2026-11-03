import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import hashlib
import json

spec = importlib.util.spec_from_file_location("isolated_host", Path(__file__).with_name("isolated_host.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class HostTest(unittest.TestCase):
    def fixture_stage(self, root):
        package = root / "package"
        (package / "constitution").mkdir(parents=True)
        (package / "skills/mnx-fixture").mkdir(parents=True)
        files = {"constitution/CORE.md": b"# Test core\n", "skills/mnx-fixture/SKILL.md": b"test skill\n"}
        for name, data in files.items():
            (package / name).write_bytes(data)
        (package / "release-manifest.json").write_text(json.dumps({"files": [{"path": name, "sha256": hashlib.sha256(raw).hexdigest()} for name, raw in files.items()]}))
        binary = root / "binary"
        binary.write_bytes(b"synthetic executable fixture")
        stage = root / "stage"
        m.stage(stage, "test", package, binary, binary)
        digest = hashlib.sha256((stage / "manifest.json").read_bytes()).hexdigest()
        return stage, digest

    def test_existing_launcher_rejects_before_creating_account_or_home(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            stage, digest = self.fixture_stage(root)
            install = root / "install"
            (install / "bin").mkdir(parents=True)
            (install / "bin/mnx-test-codex").symlink_to(root / "nonexistent")
            homes = root / "homes"
            with patch.object(m, "ROOT", install), patch.object(m, "HOMES", homes), patch.object(m.sys, "platform", "darwin"), patch.object(m.os, "geteuid", return_value=0), patch.object(m, "protected"), patch.object(m.subprocess, "run") as command:
                with self.assertRaisesRegex(RuntimeError, "Launcher already"):
                    m.install(stage, digest)
                command.assert_not_called()
                self.assertFalse(homes.exists())

    def test_restrictive_admin_umask_does_not_break_host_readability(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            stage, digest = self.fixture_stage(root)
            install = root / "install"
            (install / "bin").mkdir(parents=True)
            homes = root / "homes"
            old = os.umask(0o077)
            try:
                with patch.object(m, "ROOT", install), patch.object(m, "HOMES", homes), patch.object(m.sys, "platform", "darwin"), patch.object(m.os, "geteuid", return_value=0), patch.object(m.os, "chown"), patch.object(m, "protected"), patch.object(m.subprocess, "run", return_value=SimpleNamespace(returncode=1)), patch.object(m.subprocess, "check_output", return_value="root 0\n"):
                    m.install(stage, digest)
                for path in [install / "hosts", install / "hosts/test", homes]:
                    self.assertEqual(path.stat().st_mode & 0o777, 0o755)
                for name in ["host.json", "sandbox.sb"]:
                    self.assertEqual((install / "hosts/test" / name).stat().st_mode & 0o777, 0o644)
                self.assertTrue((homes / "test/.claude/.claude.json").exists())
            finally:
                os.umask(old)

    def test_names_cannot_inject_paths_or_shell_arguments(self):
        for name in ["../other", "a;id", "a\nb", "/etc", "x" * 21]:
            with self.assertRaises(RuntimeError):
                m.name_ok(name)
        self.assertEqual(m.name_ok("mnx-test"), "mnx-test")

    def test_profile_does_not_allow_entire_users_or_data_volume(self):
        with tempfile.TemporaryDirectory() as root:
            home, package = Path(root) / "home", Path(root) / "package"
            text = m.profile(home, package)
            self.assertIn("(deny default)", text)
            self.assertNotIn('(subpath "/Users")', text)
            self.assertNotIn('(subpath "/System")', text)
            self.assertNotIn('(allow mach-lookup)', text)

    @unittest.skipUnless(sys.platform == "darwin", "macOS sandbox integration")
    def test_real_sandbox_allows_workspace_but_denies_sibling_and_child_escape(self):
        with tempfile.TemporaryDirectory() as root:
            # Keep the /var alias: a canonical-only fixture hid live failures.
            root = Path(root)
            home, package = root / "home", root / "package"
            home.mkdir()
            package.mkdir()
            allowed, denied = home / "allowed", root / "outside"
            allowed.write_text("allowed-fixture")
            denied.write_text("other-realm-fixture")
            policy = package / "sandbox.sb"
            policy.write_text(m.profile(home, package))
            def run(*command):
                return subprocess.run(["/usr/bin/sandbox-exec", "-f", str(policy), *command], env={"PATH": "/usr/bin:/bin", "HOME": str(home)}, capture_output=True, text=True, timeout=10)
            self.assertEqual(run("/bin/cat", str(allowed)).stdout, "allowed-fixture")
            self.assertEqual(run("/bin/cat", str(allowed.resolve())).stdout, "allowed-fixture")
            for command in [("/bin/cat", str(denied)), ("/bin/sh", "-c", '/bin/cat "$1"', "sh", str(denied))]:
                result = run(*command)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn("other-realm-fixture", result.stdout)
            link = home / "escape"
            link.symlink_to(denied)
            self.assertNotEqual(run("/bin/cat", str(link)).returncode, 0)

    @unittest.skipUnless(sys.platform == "darwin" and Path("/Library/Developer/CommandLineTools/usr/bin/python3").exists(), "macOS Command Line Tools runtime")
    def test_real_sandbox_runs_trusted_python_without_xcode_selector_or_external_temp(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            home, package = root / "home", root / "package"
            home.mkdir()
            package.mkdir()
            policy = package / "sandbox.sb"
            policy.write_text(m.profile(home, package))
            result = subprocess.run(["/usr/bin/sandbox-exec", "-f", str(policy), "/Library/Developer/CommandLineTools/usr/bin/python3", "-I", "-B", "-c", "print('runtime-ok')"], env={"PATH": "/usr/bin:/bin", "HOME": str(home.resolve()), "TMPDIR": str(home.resolve())}, capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.strip(), "runtime-ok")


if __name__ == "__main__":
    unittest.main()
