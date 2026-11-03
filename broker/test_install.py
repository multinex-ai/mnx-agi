import contextlib
import hashlib
import importlib.util
import io
import json
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
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

    def test_invalid_policy_is_rejected_before_creating_stage(self):
        for raw in ['{"version":1,"version":1,"peers":{},"realms":{}}', '{"version":1,"peers":{"0":"test"},"realms":{}}', '{"version":1,"peers":{},"realms":{"test":{"namespace":"org:x","subject":"a","plan_prefix":"bad"}}}']:
            with tempfile.TemporaryDirectory() as root:
                config = Path(root) / "policy.json"
                config.write_text(raw)
                stage = Path(root) / "stage"
                with self.assertRaises(Exception):
                    m.stage(stage, config)
                self.assertFalse(stage.exists())

    def test_peer_validation_rejects_admins_unknown_users_and_service_identity(self):
        policy = {"peers": {"501": "test"}}
        with patch.object(m, "command", return_value="operator"), patch.object(m.subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout="yes operator is a member of admin")):
            with self.assertRaisesRegex(RuntimeError, "non-administrator"):
                m.validate_peers(policy)
        with patch.object(m, "command", side_effect=RuntimeError("unknown user")):
            with self.assertRaises(RuntimeError):
                m.validate_peers(policy)
        with self.assertRaisesRegex(RuntimeError, "Service identity"):
            m.validate_peers(policy, 501)
        with patch.object(m, "command", return_value="restricted"), patch.object(m.subprocess, "run", return_value=SimpleNamespace(returncode=67, stdout="no restricted is NOT a member of admin")):
            m.validate_peers(policy)


if __name__ == "__main__":
    unittest.main()
