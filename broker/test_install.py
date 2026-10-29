import contextlib
import hashlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("install_broker", Path(__file__).with_name("install_macos.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class InstallTest(unittest.TestCase):
    def prepare(self, root):
        stage = Path(root) / "stage"
        with contextlib.redirect_stdout(io.StringIO()):
            m.stage(stage, None)
        digest = hashlib.sha256((stage / "manifest.json").read_bytes()).hexdigest()
        return stage, digest

    def test_default_stage_is_unconfigured_and_does_not_activate_managed_policy(self):
        with tempfile.TemporaryDirectory() as root:
            stage, digest = self.prepare(root)
            blobs, manifest = m.read_stage(stage, digest)
            self.assertFalse(manifest["installsManagedPolicies"])
            self.assertEqual(json.loads(blobs["policy.json"])["peers"], {})
            self.assertIn(b"/usr/bin/env -i", blobs["client"])
            self.assertIn(b"python3 -I -B", blobs["client"])
            self.assertNotIn(b'"$@"', blobs["client"])

    def test_changed_source_or_manifest_prevents_installation(self):
        with tempfile.TemporaryDirectory() as root:
            stage, digest = self.prepare(root)
            (stage / "memq_broker.py").write_text("changed")
            with self.assertRaisesRegex(RuntimeError, "Staged file changed"):
                m.read_stage(stage, digest)
            with self.assertRaisesRegex(RuntimeError, "manifest digest changed"):
                m.read_stage(stage, "0" * 64)

    def test_symlink_staged_source_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            stage, digest = self.prepare(root)
            (stage / "client").unlink()
            (stage / "client").symlink_to(stage / "policy.json")
            with self.assertRaisesRegex(RuntimeError, "Invalid staged file"):
                m.read_stage(stage, digest)


if __name__ == "__main__":
    unittest.main()
