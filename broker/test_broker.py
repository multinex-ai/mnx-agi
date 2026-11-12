import copy
import importlib.util
import http.server
import json
import os
import socket
import tempfile
import threading
import time
import stat
from types import SimpleNamespace
import unittest
import urllib.request
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("memq_broker", Path(__file__).with_name("memq_broker.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def policy():
    return {"version": 1, "state_dir": "/var/db/mnx-memq", "socket": m.SOCKET, "peers": {str(os.getuid()): "project-one"}, "realms": {"project-one": {"namespace": "org:one", "subject": "subject-one", "plan_prefix": "mnx-project-one-"}, "project-two": {"namespace": "org:two", "subject": "subject-two", "plan_prefix": "mnx-project-two-"}}}


class FakeTransport:
    def __init__(self, name, config):
        self.name, self.config = name, config
        self.calls = []
        self.records = {}
        self.subject = config["subject"]
        self.namespace = config["namespace"]
        self.foreign_result = False
        self.session = None

    def call(self, tool, args):
        self.calls.append((tool, copy.deepcopy(args)))
        if tool == "reunion":
            return {"access": {"namespace": self.namespace, "namespace_scoped": True, "auth_source": "oauth_billing_manager", "authenticated_subject": self.subject}}
        key = args["plan_id"]
        if tool == "plan_state_write":
            previous = self.records.get(key, {"state_version": 0, "state": {}})
            if args["expected_state_version"] != previous["state_version"]:
                raise m.Denied("stale_version")
            def merge(base, patch):
                out = copy.deepcopy(base)
                for key, value in patch.items():
                    out[key] = merge(out[key], value) if isinstance(value, dict) and isinstance(out.get(key), dict) else copy.deepcopy(value)
                return out
            self.records[key] = {"state_version": previous["state_version"] + 1, "state": merge(previous["state"], args["state_patch"])}
            return {"namespace": "org:foreign" if self.foreign_result else self.namespace, "plan_id": key, "state_version": self.records[key]["state_version"], "applied": True}
        return dict(self.records.get(key, {}), namespace="org:foreign" if self.foreign_result else self.namespace, plan_id=key)

    def call_with_tokens(self, tool, args, credentials):
        return self.call(tool, args)

    def bind(self):
        return self.call


class FakeStore:
    def __init__(self):
        self.data = {}

    def write(self, realm, data):
        self.data[realm] = copy.deepcopy(data)

    def read(self, realm):
        return copy.deepcopy(self.data[realm])


class BrokerTest(unittest.TestCase):
    def setUp(self):
        self.config = policy()
        self.audit = []
        self.transports = {}
        def make(name):
            self.transports[name] = FakeTransport(name, self.config["realms"][name])
            return self.transports[name]
        self.broker = m.Broker(self.config, make, self.audit.append)
        self.read = {"tool": "plan_read", "arguments": {"plan_id": "mnx-project-one-fixture"}}

    def test_peer_identity_comes_from_kernel(self):
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as server, tempfile.TemporaryDirectory() as directory:
            address = str(Path(directory) / "socket")
            server.bind(address)
            server.listen(1)
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
                client.connect(address)
                connection, _ = server.accept()
                with connection:
                    self.assertEqual(m.peer_uid(connection), os.getuid())

    def checkpoint(self):
        return {"schema_version": 1, "objective": "Resume the verified task", "acceptance": ["Tests pass"], "done": ["Inspected source"], "next": ["Run focused tests"], "blockers": [], "constraints": ["Keep other projects separate"], "pending_effects": [], "evidence": ["test:fixture"], "artifacts": [{"ref": "src/example.js", "revision": "abc123"}]}

    def test_compact_roundtrip_omits_full_state_and_reuses_version(self):
        request = {"tool": "checkpoint_write", "arguments": {"plan_id": self.read["arguments"]["plan_id"], "expected_state_version": 0, "checkpoint": self.checkpoint()}}
        receipt = self.broker.execute(os.getuid(), request)
        self.assertTrue(receipt["write_acknowledged"])
        self.assertTrue(receipt["readback_required"])
        self.assertNotIn("checkpoint", receipt)
        transport = self.transports["project-one"]
        transport.records[request["arguments"]["plan_id"]]["state"]["private_transcript"] = "must not be returned"
        compact = {"tool": "context_read", "arguments": {"plan_id": request["arguments"]["plan_id"]}}
        result = self.broker.execute(os.getuid(), compact)
        self.assertEqual(result["checkpoint"], self.checkpoint())
        self.assertNotIn("private_transcript", json.dumps(result))
        compact["arguments"]["known_version"] = result["state_version"]
        self.assertEqual(self.broker.execute(os.getuid(), compact), {"plan_id": result["plan_id"], "state_version": result["state_version"], "unchanged": True})

    def test_compact_boundary_rejects_foreign_scope_and_unknown_arguments(self):
        for tool in ["context_read", "checkpoint_write"]:
            args = {"plan_id": self.read["arguments"]["plan_id"]}
            if tool == "checkpoint_write":
                args.update(expected_state_version=0, checkpoint=self.checkpoint())
            for field in ["namespace", "realm", "uid", "access_token"]:
                with self.subTest(tool=tool, field=field), self.assertRaises(m.Denied):
                    self.broker.execute(os.getuid(), {"tool": tool, "arguments": dict(args, **{field: "forged"})})
            with self.assertRaises(m.Denied):
                self.broker.execute(os.getuid(), {"tool": tool, "arguments": dict(args, plan_id="mnx-project-two-fixture")})
            self.transports["project-one"].subject = "wrong-subject"
            with self.assertRaisesRegex(m.Denied, "principal_identity_mismatch"):
                self.broker.execute(os.getuid(), {"tool": tool, "arguments": args})
            self.transports["project-one"].subject = "subject-one"

    def test_compact_read_validates_legacy_data_and_never_truncates_obligations(self):
        result = {"plan_id": "mnx-project-one-fixture", "state_version": 1, "state": {m.CHECKPOINT_KEY: self.checkpoint()}}
        self.assertIsNone(m.compact_result(dict(result, state={}), {})["checkpoint"])
        for checkpoint in [dict(self.checkpoint(), transcript="forbidden"), dict(self.checkpoint(), schema_version=True), dict(self.checkpoint(), next=[{}]), dict(self.checkpoint(), done=["x"] * 9)]:
            with self.assertRaises(m.Denied):
                m.compact_result(dict(result, state={m.CHECKPOINT_KEY: checkpoint}), {})
        large = self.checkpoint()
        large["constraints"] = ["界" * 500] * 7
        with self.assertRaisesRegex(m.Denied, "checkpoint_too_large"):
            m.validate_checkpoint(large)
        result["state"][m.CHECKPOINT_KEY]["constraints"] = ["critical requirement " * 20] * 3
        with self.assertRaisesRegex(m.Denied, "context_budget_exceeded"):
            m.compact_result(result, {"max_bytes": 1000})

    def test_compact_stale_write_and_audit_failure_do_not_retry(self):
        args = {"plan_id": self.read["arguments"]["plan_id"], "expected_state_version": 0, "checkpoint": self.checkpoint()}
        self.broker.execute(os.getuid(), {"tool": "checkpoint_write", "arguments": args})
        with self.assertRaises(m.Denied):
            self.broker.execute(os.getuid(), {"tool": "checkpoint_write", "arguments": args})
        self.assertEqual(len([x for x in self.transports["project-one"].calls if x[0] == "plan_state_write"]), 2)
        for value in [True, -1, 1.2, 9007199254740992]:
            with self.assertRaises(m.Denied):
                self.broker.execute(os.getuid(), {"tool": "context_read", "arguments": {"plan_id": args["plan_id"], "known_version": value}})

    def test_compact_write_bad_receipt_can_be_reconciled_without_rewrite(self):
        args = {"plan_id": self.read["arguments"]["plan_id"], "expected_state_version": 0, "checkpoint": self.checkpoint()}
        transport = self.transports["project-one"]
        original = transport.call
        def call(tool, arguments):
            result = original(tool, arguments)
            if tool == "plan_state_write":
                result["state_version"] = True
            return result
        transport.call = call
        with self.assertRaisesRegex(m.Denied, "checkpoint_receipt_mismatch"):
            self.broker.execute(os.getuid(), {"tool": "checkpoint_write", "arguments": args})
        result = self.broker.execute(os.getuid(), {"tool": "context_read", "arguments": {"plan_id": args["plan_id"]}})
        self.assertEqual(result["checkpoint"], args["checkpoint"])
        self.assertEqual(len([x for x in transport.calls if x[0] == "plan_state_write"]), 1)

    def test_compact_unicode_budget_and_legacy_replacement_are_consistent(self):
        checkpoint = self.checkpoint()
        checkpoint["constraints"] = ["界" * 500] * 5
        plan = self.read["arguments"]["plan_id"]
        self.transports["project-one"].records[plan] = {"state_version": 1, "state": {m.CHECKPOINT_KEY: {"transcript": "old malformed object"}, "other": "retain me"}}
        self.broker.execute(os.getuid(), {"tool": "checkpoint_write", "arguments": {"plan_id": plan, "expected_state_version": 1, "checkpoint": checkpoint}})
        result = self.broker.execute(os.getuid(), {"tool": "context_read", "arguments": {"plan_id": plan, "max_bytes": 12000}})
        self.assertEqual(result["checkpoint"], checkpoint)
        self.assertNotIn("transcript", json.dumps(result))
        self.assertEqual(self.transports["project-one"].records[plan]["state"]["other"], "retain me")

    def test_unknown_peer_is_denied_before_upstream(self):
        with self.assertRaisesRegex(m.Denied, "peer_not_allowed"):
            self.broker.execute(os.getuid() + 100000, self.read)
        self.assertEqual(self.transports["project-one"].calls, [])

    def test_caller_cannot_choose_identity_or_realm(self):
        for field in ["uid", "realm", "namespace", "subject", "access_token"]:
            with self.subTest(field=field), self.assertRaises(m.Denied):
                self.broker.execute(os.getuid(), dict(self.read, **{field: "forged"}))
        self.assertEqual(self.transports["project-one"].calls, [])

    def test_namespace_override_is_denied_before_upstream(self):
        with self.assertRaises(m.Denied):
            self.broker.execute(os.getuid(), {"tool": "plan_read", "arguments": dict(self.read["arguments"], namespace="org:two")})
        self.assertEqual(self.transports["project-one"].calls, [])

    def test_foreign_plan_is_denied_before_upstream(self):
        with self.assertRaises(m.Denied):
            self.broker.execute(os.getuid(), {"tool": "plan_read", "arguments": {"plan_id": "mnx-project-two-fixture"}})
        self.assertEqual(self.transports["project-one"].calls, [])

    def test_wrong_subject_in_same_organization_is_denied(self):
        self.transports["project-one"].subject = "subject-two"
        with self.assertRaisesRegex(m.Denied, "principal_identity_mismatch"):
            self.broker.execute(os.getuid(), self.read)
        self.assertEqual(len(self.transports["project-one"].calls), 1)

    def test_missing_subject_denied(self):
        self.transports["project-one"].subject = None
        with self.assertRaises(m.Denied):
            self.broker.execute(os.getuid(), self.read)

    def test_wrong_namespace_denied(self):
        self.transports["project-one"].namespace = "org:two"
        with self.assertRaises(m.Denied):
            self.broker.execute(os.getuid(), self.read)
        self.assertEqual(len(self.transports["project-one"].calls), 1)

    def test_unsupported_tools_and_boolean_versions_denied(self):
        for request in [{"tool": "reflect_memory", "arguments": {}}, {"tool": "plan_write", "arguments": {"plan_id": "mnx-project-one-fixture", "expected_state_version": True, "state_patch": {}}}]:
            with self.subTest(request=request), self.assertRaises(m.Denied):
                self.broker.execute(os.getuid(), request)

    def test_audit_outage_prevents_mutation(self):
        self.broker.audit = lambda _: (_ for _ in ()).throw(OSError("fixture outage"))
        with self.assertRaises(OSError):
            self.broker.execute(os.getuid(), {"tool": "plan_write", "arguments": {"plan_id": "mnx-project-one-fixture", "expected_state_version": 0, "state_patch": {}}})
        self.assertEqual(self.transports["project-one"].records, {})

    def test_roundtrip_and_stale_write_no_retry(self):
        args = {"plan_id": "mnx-project-one-fixture", "expected_state_version": 0, "state_patch": {"synthetic": True}}
        self.broker.execute(os.getuid(), {"tool": "plan_write", "arguments": args})
        with self.assertRaisesRegex(m.Denied, "stale"):
            self.broker.execute(os.getuid(), {"tool": "plan_write", "arguments": args})
        result = self.broker.execute(os.getuid(), self.read)
        self.assertEqual(result["state_version"], 1)
        self.assertEqual(result["state"], {"synthetic": True})
        self.assertEqual(len([x for x in self.transports["project-one"].calls if x[0] == "plan_state_write"]), 2)
        self.assertNotIn("mnx-project-one-fixture", json.dumps(self.audit))
        self.assertNotIn("synthetic", json.dumps(self.audit))

    def test_foreign_response_withheld(self):
        self.transports["project-one"].foreign_result = True
        with self.assertRaisesRegex(m.Denied, "response_scope_mismatch"):
            self.broker.execute(os.getuid(), self.read)

    def test_overlapping_prefixes_in_one_namespace_denied(self):
        p = policy()
        p["realms"]["project-two"].update(namespace="org:one", plan_prefix="mnx-project-one-nested-")
        with self.assertRaisesRegex(m.Denied, "overlapping_plan_scopes"):
            m.validate_policy(p)

    def test_duplicate_keys_and_nonfinite_values_denied(self):
        for text in ['{"uid":1,"uid":2}', '{"value":NaN}']:
            with self.assertRaises(m.Denied):
                m.strict_json(text)

    def test_real_socket_rejects_identity_injection_and_admin_commands(self):
        with tempfile.TemporaryDirectory() as directory:
            filename = str(Path(directory) / "socket")
            with m.Server(filename, m.Handler) as server:
                server.broker = self.broker
                server.oauth = object()
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                try:
                    result = m.connect(dict(self.read, kind="tool"), filename)
                    self.assertEqual(result["namespace"], "org:one")
                    with self.assertRaises(m.Denied):
                        m.connect(dict(self.read, kind="tool", uid=0), filename)
                    if os.getuid() != 0:
                        with self.assertRaisesRegex(m.Denied, "administrator_required"):
                            m.connect({"kind": "login", "realm": "project-one"}, filename)
                finally:
                    server.shutdown()
                    thread.join(2)

    def test_symlinked_credential_file_is_never_opened(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "project-one.json"
            file.symlink_to(Path(directory) / "other")
            with self.assertRaises((m.Denied, FileNotFoundError)):
                m.CredentialStore(directory).read("project-one")

    def test_standard_macos_var_alias_is_supported_only_when_root_owned(self):
        filename = "/var/db/mnx-memq/project-one.json"
        def lstat(name):
            if name == "/var":
                return SimpleNamespace(st_uid=0, st_mode=stat.S_IFLNK | 0o755)
            return SimpleNamespace(st_uid=501 if name.endswith(".json") else 0, st_mode=(stat.S_IFREG | 0o600) if name.endswith(".json") else (stat.S_IFDIR | 0o755))
        with patch.object(m.os.path, "realpath", return_value="/private" + filename), patch.object(m.os, "lstat", side_effect=lstat):
            m.protected_file(filename, 501, private=True)
        with patch.object(m.os.path, "realpath", return_value="/attacker/secret"):
            with self.assertRaisesRegex(m.Denied, "unprotected_alias"):
                m.protected_file(filename, 501, private=True)

    def test_http_redirect_or_unpinned_endpoint_cannot_receive_credentials(self):
        with self.assertRaises(m.Denied):
            m.HTTP().request("https://untrusted.example.invalid/token", {"token": "fixture-only"})
        with self.assertRaises(m.Denied):
            m.NoRedirect().redirect_request(None, None, 302, "Moved", {}, "https://untrusted.example.invalid/")

    def test_identity_and_operation_pin_one_credential_generation(self):
        class Store:
            reads = 0
            def read(self, realm):
                self.reads += 1
                return {"access_token": "generation-" + str(self.reads), "expires_at": time.time() + 3600}
        class HTTP:
            def __init__(self):
                self.headers = []
            def request(self, url, payload, headers, **unused):
                self.headers.append(headers["Authorization"])
                if payload["method"] == "initialize":
                    return {"result": {}}, {}
                if payload["method"] == "notifications/initialized":
                    return {}, {}
                body = {"ok": True, "result": {"fixture": True}}
                return {"id": payload["id"], "result": {"content": [{"type": "text", "text": json.dumps(body)}]}}, {}
        store, http = Store(), HTTP()
        call = m.Upstream("project-one", store, http).bind()
        call("reunion", {})
        call("plan_state_read", {})
        self.assertEqual(store.reads, 1)
        self.assertEqual(set(http.headers), {"Bearer generation-1"})

    def test_callback_expiry_closes_listener_without_polling(self):
        class HTTP:
            def request(self, *args, **kwargs):
                return {"client_id": "fixture-client"}, {}
        oauth = m.OAuth(self.broker, FakeStore(), HTTP(), lifetime=0.1)
        started = oauth.begin("project-one")
        pending = oauth.pending[started["login_id"]]
        port = pending["server"].server_port
        time.sleep(0.8)
        self.assertEqual(pending["status"], "expired")
        with self.assertRaises(OSError):
            socket.create_connection(("127.0.0.1", port), timeout=0.2)

    def test_callback_has_bounded_slots_and_connection_timeout(self):
        with m.CallbackServer(("127.0.0.1", 0), http.server.BaseHTTPRequestHandler) as server:
            held = [server.slots.acquire(blocking=False) for _ in range(5)]
            self.assertEqual(held, [True, True, True, True, False])
            for _ in range(4):
                server.slots.release()
            with socket.create_connection(server.server_address, timeout=1) as client:
                accepted, _ = server.get_request()
                with accepted:
                    self.assertEqual(accepted.gettimeout(), 3)

    def test_oauth_tokens_activate_only_after_verified_subject(self):
        class Http:
            def request(self, url, payload, **unused):
                if url.endswith("/register"):
                    return {"client_id": "fixture-client"}, {}
                return {"token_type": "Bearer", "access_token": "fixture-only", "refresh_token": "fixture-refresh", "expires_in": 3600}, {}
        for valid in [True, False]:
            with self.subTest(valid=valid):
                store = FakeStore()
                transport = self.transports["project-one"]
                transport.subject = "subject-one" if valid else "wrong-subject"
                oauth = m.OAuth(self.broker, store, Http())
                started = oauth.begin("project-one")
                pending = oauth.pending[started["login_id"]]
                url = pending["redirect"] + "?" + urllib.parse.urlencode({"state": started["login_id"], "code": "fixture-code"})
                try:
                    urllib.request.urlopen(url, timeout=5).read()
                except urllib.error.HTTPError as error:
                    self.assertEqual(error.code, 400)
                self.assertEqual(oauth.status(started["login_id"])["status"], "complete" if valid else "failed")
                self.assertEqual("project-one" in store.data, valid)
                pending["server"].shutdown()
                pending["server"].server_close()


if __name__ == "__main__":
    unittest.main()
