#!/usr/bin/python3
"""Credential-owning MemQ broker. MCP clients never receive OAuth material.

Production runs as a dedicated service user with root-owned configuration.
Peer UIDs select a fixed realm; caller-supplied identities are never trusted.
The administrator must isolate agent processes/filesystems as a separate layer.
"""
import argparse
import base64
import ctypes
import hashlib
import http.server
import json
import os
import re
import secrets
import socket
import socketserver
import stat
import struct
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

RESOURCE = "https://mcp.multinex.ai/mcp/v1"
AUTHORITY = "https://billing.multinex.ai"
SOCKET = "/var/db/mnx-memq-socket/broker.sock"
MAX_FRAME = 32768
MAX_RESPONSE = 1024 * 1024
TOOLS = [
    {"name": "plan_read", "description": "Read a plan in this OS identity's fixed realm.", "inputSchema": {"type": "object", "additionalProperties": False, "required": ["plan_id"], "properties": {"plan_id": {"type": "string"}}}},
    {"name": "plan_write", "description": "Conditionally update a plan in this OS identity's fixed realm.", "inputSchema": {"type": "object", "additionalProperties": False, "required": ["plan_id", "expected_state_version", "state_patch"], "properties": {"plan_id": {"type": "string"}, "expected_state_version": {"type": "integer", "minimum": 0}, "state_patch": {"type": "object"}}}},
]


class Denied(Exception):
    pass


def strict_json(raw):
    def pairs(items):
        out = {}
        for key, value in items:
            if key in out:
                raise Denied("duplicate_key")
            out[key] = value
        return out
    try:
        return json.loads(raw, object_pairs_hook=pairs, parse_constant=lambda _: (_ for _ in ()).throw(Denied("invalid_number")))
    except (ValueError, RecursionError) as exc:
        raise Denied("invalid_json") from exc


def exact_keys(value, allowed, required=()):
    if not isinstance(value, dict) or not set(value).issubset(allowed) or not set(required).issubset(value):
        raise Denied("invalid_arguments")


def peer_uid(connection):
    if sys.platform == "darwin":
        uid, gid = ctypes.c_uint(), ctypes.c_uint()
        libc = ctypes.CDLL(None, use_errno=True)
        if libc.getpeereid(connection.fileno(), ctypes.byref(uid), ctypes.byref(gid)) != 0:
            raise Denied("peer_identity_unavailable")
        return uid.value
    if sys.platform.startswith("linux"):
        return struct.unpack("3i", connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))[1]
    raise Denied("unsupported_peer_identity")


def protected_file(filename, owner, private=False):
    canonical = os.path.realpath(filename)
    if canonical != os.path.abspath(filename):
        # /var is Apple's root-owned alias; do not accept arbitrary aliases.
        system_alias = os.path.abspath(filename).startswith("/var/") and canonical == "/private" + os.path.abspath(filename)
        if not system_alias or os.lstat("/var").st_uid != 0:
            raise Denied("unprotected_alias")
    filename = canonical
    st = os.lstat(filename)
    if not stat.S_ISREG(st.st_mode) or st.st_uid != owner or st.st_mode & (0o077 if private else 0o022):
        raise Denied("unprotected_file")
    # All parents must exclude writes by identities other than the owner/root.
    cursor = os.path.dirname(os.path.abspath(filename))
    while cursor != "/":
        st = os.lstat(cursor)
        if not stat.S_ISDIR(st.st_mode) or st.st_uid not in (0, owner) or st.st_mode & 0o022:
            raise Denied("unprotected_parent")
        cursor = os.path.dirname(cursor)


def validate_policy(policy):
    exact_keys(policy, {"version", "state_dir", "socket", "peers", "realms"}, {"version", "state_dir", "socket", "peers", "realms"})
    if policy["version"] != 1 or not os.path.isabs(policy["state_dir"]) or not os.path.isabs(policy["socket"]):
        raise Denied("invalid_policy")
    if not isinstance(policy["peers"], dict) or not isinstance(policy["realms"], dict):
        raise Denied("invalid_policy")
    for name, realm in policy["realms"].items():
        if not re.fullmatch(r"[a-z][a-z0-9-]{0,63}", name):
            raise Denied("invalid_realm")
        exact_keys(realm, {"namespace", "subject", "plan_prefix"}, {"namespace", "subject", "plan_prefix"})
        if not isinstance(realm["namespace"], str) or not realm["namespace"].startswith("org:"):
            raise Denied("invalid_namespace")
        if not isinstance(realm["subject"], str) or not re.fullmatch(r"[a-zA-Z0-9-]{1,128}", realm["subject"]):
            raise Denied("invalid_subject")
        if not isinstance(realm["plan_prefix"], str) or not re.fullmatch(r"[a-z][a-z0-9-]{7,79}-", realm["plan_prefix"]):
            raise Denied("invalid_prefix")
    for uid, realm in policy["peers"].items():
        if not re.fullmatch(r"[1-9][0-9]*", uid) or realm not in policy["realms"]:
            raise Denied("invalid_peer")
    realms = list(policy["realms"].values())
    for index, left in enumerate(realms):
        for right in realms[index + 1:]:
            if left["namespace"] == right["namespace"] and (left["plan_prefix"].startswith(right["plan_prefix"]) or right["plan_prefix"].startswith(left["plan_prefix"])):
                raise Denied("overlapping_plan_scopes")
    return policy


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise Denied("redirect_refused")


class HTTP:
    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def request(self, url, payload, headers=None, form=False):
        if url not in (RESOURCE, AUTHORITY + "/oauth/token", AUTHORITY + "/oauth/register"):
            raise Denied("destination_refused")
        body = urllib.parse.urlencode(payload).encode() if form else json.dumps(payload, allow_nan=False).encode()
        request_headers = {"Content-Type": "application/x-www-form-urlencoded" if form else "application/json", "Accept": "application/json, text/event-stream"}
        request_headers.update(headers or {})
        request = urllib.request.Request(url, data=body, headers=request_headers, method="POST")
        try:
            with self.opener.open(request, timeout=20) as response:
                raw = response.read(MAX_RESPONSE + 1)
                if len(raw) > MAX_RESPONSE:
                    raise Denied("response_too_large")
                if not raw and response.status in (202, 204):
                    return {}, dict(response.headers)
                if response.headers.get_content_type() == "text/event-stream":
                    events = [x[5:].strip() for x in raw.decode().splitlines() if x.startswith("data:")]
                    if len(events) != 1:
                        raise Denied("invalid_event_response")
                    raw = events[0]
                return strict_json(raw), dict(response.headers)
        except urllib.error.HTTPError as exc:
            # Never log error bodies or bearer headers.
            raise Denied("upstream_http_" + str(exc.code)) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise Denied("upstream_unavailable") from None


class CredentialStore:
    def __init__(self, directory):
        self.directory = directory

    def filename(self, realm):
        if not re.fullmatch(r"[a-z][a-z0-9-]{0,63}", realm):
            raise Denied("invalid_realm")
        return os.path.join(self.directory, realm + ".json")

    def read(self, realm):
        filename = self.filename(realm)
        protected_file(filename, os.geteuid(), private=True)
        fd = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            with os.fdopen(fd, "rb") as stream:
                raw = stream.read(MAX_FRAME + 1)
                if len(raw) > MAX_FRAME:
                    raise Denied("credential_record_too_large")
                return strict_json(raw)
        except FileNotFoundError:
            raise Denied("sign_in_required") from None

    def write(self, realm, credentials):
        filename = self.filename(realm)
        temp = filename + "." + secrets.token_hex(12)
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            with os.fdopen(fd, "w") as stream:
                json.dump(credentials, stream, allow_nan=False)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temp, filename)
        finally:
            if os.path.exists(temp):
                os.unlink(temp)


class Upstream:
    def __init__(self, realm, store, http):
        self.realm, self.store, self.http = realm, store, http
        self.session = None
        self.sequence = 0

    def tokens(self):
        try:
            data = self.store.read(self.realm)
        except FileNotFoundError:
            raise Denied("sign_in_required") from None
        if data.get("expires_at", 0) <= time.time() + 30:
            if not data.get("refresh_token"):
                raise Denied("sign_in_required")
            value, _ = self.http.request(AUTHORITY + "/oauth/token", {"grant_type": "refresh_token", "refresh_token": data["refresh_token"], "client_id": data["client_id"]}, form=True)
            data = normalize_tokens(value, data["client_id"], data.get("refresh_token"))
            self.store.write(self.realm, data)
            self.session = None
        return data

    def call_with_tokens(self, name, arguments, credentials):
        headers = {"Authorization": "Bearer " + credentials["access_token"], "MCP-Protocol-Version": "2024-11-05"}
        if self.session is None:
            self.sequence += 1
            init, response_headers = self.http.request(RESOURCE, {"jsonrpc": "2.0", "id": self.sequence, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "mnx-credential-broker", "version": "0.1.0"}}}, headers)
            if init.get("error") or not isinstance(init.get("result"), dict):
                raise Denied("initialization_failed")
            self.session = next((v for k, v in response_headers.items() if k.lower() == "mcp-session-id"), "")
            if self.session:
                headers["Mcp-Session-Id"] = self.session
            self.http.request(RESOURCE, {"jsonrpc": "2.0", "method": "notifications/initialized"}, headers)
        elif self.session:
            headers["Mcp-Session-Id"] = self.session
        self.sequence += 1
        value, _ = self.http.request(RESOURCE, {"jsonrpc": "2.0", "id": self.sequence, "method": "tools/call", "params": {"name": name, "arguments": arguments}}, headers)
        if value.get("id") != self.sequence or value.get("error"):
            raise Denied("upstream_rpc_failed")
        result = value.get("result", {})
        if result.get("isError") is True:
            raise Denied("upstream_tool_failed")
        blocks = result.get("content", [])
        if len(blocks) != 1 or blocks[0].get("type") != "text":
            raise Denied("invalid_tool_result")
        envelope = strict_json(blocks[0].get("text", ""))
        if envelope.get("ok") is not True or not isinstance(envelope.get("result"), dict):
            raise Denied("upstream_operation_failed")
        return envelope["result"]

    def call(self, name, arguments):
        return self.call_with_tokens(name, arguments, self.tokens())

    def bind(self):
        # Identity verification and the protected operation must use the same
        # credential generation, even if expiry occurs between the requests.
        credentials = dict(self.tokens())
        return lambda name, arguments: self.call_with_tokens(name, arguments, credentials)


def normalize_tokens(value, client_id, previous_refresh=None):
    token = value.get("access_token")
    if not isinstance(token, str) or not token or value.get("token_type", "").lower() != "bearer":
        raise Denied("invalid_token_response")
    duration = value.get("expires_in")
    if not isinstance(duration, (int, float)) or isinstance(duration, bool) or not 0 < duration <= 366 * 86400:
        raise Denied("invalid_token_expiry")
    return {"client_id": client_id, "access_token": token, "refresh_token": value.get("refresh_token", previous_refresh), "expires_at": time.time() + duration}


def verify_identity(result, policy):
    access = result.get("access", {})
    if access.get("namespace") != policy["namespace"] or access.get("namespace_scoped") is not True or access.get("auth_source") != "oauth_billing_manager":
        raise Denied("namespace_identity_mismatch")
    if access.get("authenticated_subject") != policy["subject"]:
        raise Denied("principal_identity_mismatch")


def validate_operation(tool, arguments, realm):
    if tool not in ("plan_read", "plan_write"):
        raise Denied("tool_not_allowed")
    allowed = {"plan_id"} if tool == "plan_read" else {"plan_id", "expected_state_version", "state_patch"}
    exact_keys(arguments, allowed, allowed)
    plan = arguments["plan_id"]
    if not isinstance(plan, str) or not re.fullmatch(r"[a-zA-Z0-9-]{1,160}", plan) or not plan.startswith(realm["plan_prefix"]):
        raise Denied("plan_not_allowed")
    if tool == "plan_write":
        version = arguments["expected_state_version"]
        if isinstance(version, bool) or not isinstance(version, int) or not 0 <= version <= 9007199254740991 or not isinstance(arguments["state_patch"], dict):
            raise Denied("conditional_write_required")
    if len(json.dumps(arguments, allow_nan=False).encode()) > 16384:
        raise Denied("payload_too_large")


class Broker:
    def __init__(self, policy, transport_factory, audit):
        self.policy = validate_policy(policy)
        self.transports = {name: transport_factory(name) for name in policy["realms"]}
        self.locks = {name: threading.Lock() for name in policy["realms"]}
        self.audit = audit

    def execute(self, uid, request):
        exact_keys(request, {"tool", "arguments"}, {"tool", "arguments"})
        name = self.policy["peers"].get(str(uid))
        if name is None:
            raise Denied("peer_not_allowed")
        realm = self.policy["realms"][name]
        tool, arguments = request["tool"], request["arguments"]
        validate_operation(tool, arguments, realm)
        with self.locks[name]:
            upstream = self.transports[name]
            call = upstream.bind()
            verify_identity(call("reunion", {"include_status": False}), realm)
            operation = secrets.token_hex(12)
            self.audit({"operation": operation, "realm": hashlib.sha256(name.encode()).hexdigest(), "tool": tool, "phase": "dispatching"})
            try:
                result = call("plan_state_read" if tool == "plan_read" else "plan_state_write", dict(arguments, namespace=realm["namespace"]))
                if result.get("namespace") != realm["namespace"] or result.get("plan_id") != arguments["plan_id"]:
                    raise Denied("response_scope_mismatch")
                self.audit({"operation": operation, "tool": tool, "phase": "returned"})
                return result
            except Exception:
                self.audit({"operation": operation, "tool": tool, "phase": "outcome_unconfirmed"})
                raise


def append_audit(filename, event):
    fd = os.open(filename, os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as stream:
        json.dump(dict(event, at=time.time()), stream, allow_nan=False)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())


class CallbackServer(http.server.ThreadingHTTPServer):
    daemon_threads = True
    block_on_close = False

    def __init__(self, *args):
        self.slots = threading.BoundedSemaphore(4)
        super().__init__(*args)

    def get_request(self):
        connection, address = super().get_request()
        connection.settimeout(3)
        return connection, address

    def process_request(self, request, address):
        if not self.slots.acquire(blocking=False):
            request.close()
            return
        try:
            super().process_request(request, address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.slots.release()


def stop_callback(server):
    server.shutdown()
    server.server_close()


class OAuth:
    def __init__(self, broker, store, http, lifetime=300):
        self.broker, self.store, self.http = broker, store, http
        self.lifetime = lifetime
        self.pending = {}
        self.lock = threading.Lock()

    def begin(self, realm_name):
        if realm_name not in self.broker.policy["realms"]:
            raise Denied("unknown_realm")
        with self.lock:
            now = time.time()
            for key, old in list(self.pending.items()):
                if old["expires"] <= now:
                    old["timer"].cancel()
                    threading.Thread(target=stop_callback, args=(old["server"],), daemon=True).start()
                    del self.pending[key]
            if len(self.pending) >= 4:
                raise Denied("too_many_logins")
            state, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(48)
            manager = self
            class Callback(http.server.BaseHTTPRequestHandler):
                def log_message(self, *unused):
                    pass

                def do_GET(self):
                    parsed = urllib.parse.urlsplit(self.path)
                    query = urllib.parse.parse_qs(parsed.query)
                    with manager.lock:
                        pending = manager.pending.get(state)
                        valid = pending and pending["status"] == "waiting" and pending["expires"] > time.time() and parsed.path == "/callback" and query.get("state") == [state] and len(query.get("code", [])) == 1
                        if valid:
                            pending["status"] = "exchanging"
                    if not valid:
                        self.send_error(400, "Invalid or expired authorization")
                        return
                    try:
                        value, _ = manager.http.request(AUTHORITY + "/oauth/token", {"grant_type": "authorization_code", "code": query["code"][0], "redirect_uri": pending["redirect"], "client_id": pending["client_id"], "code_verifier": verifier, "resource": RESOURCE}, form=True)
                        credentials = normalize_tokens(value, pending["client_id"])
                        transport = manager.broker.transports[realm_name]
                        with manager.broker.locks[realm_name]:
                            transport.session = None
                            identity = transport.call_with_tokens("reunion", {"include_status": False}, credentials)
                            verify_identity(identity, manager.broker.policy["realms"][realm_name])
                            if pending["status"] != "exchanging" or pending["expires"] <= time.time():
                                raise Denied("authorization_expired")
                            manager.store.write(realm_name, credentials)
                        pending["status"] = "complete"
                        message = b"MemQ broker authorization complete. You can close this tab."
                        self.send_response(200)
                    except Exception:
                        pending["status"] = "failed"
                        message = b"Authorization failed: account identity did not verify or upstream is unavailable. No new credentials activated."
                        self.send_response(400)
                    self.send_header("Content-Type", "text/plain; charset=utf-8")
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    self.wfile.write(message)
                    pending["timer"].cancel()
                    threading.Thread(target=stop_callback, args=(self.server,), daemon=True).start()
            server = CallbackServer(("127.0.0.1", 0), Callback)
            redirect = "http://127.0.0.1:%s/callback" % server.server_port
            try:
                registration, _ = self.http.request(AUTHORITY + "/oauth/register", {"client_name": "MNX-AGI isolated credential broker", "redirect_uris": [redirect], "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"], "token_endpoint_auth_method": "none"})
                client_id = registration.get("client_id")
                if not isinstance(client_id, str) or not client_id:
                    raise Denied("registration_failed")
            except Exception:
                server.server_close()
                raise
            def expire():
                with self.lock:
                    pending = self.pending.get(state)
                    if pending and pending["status"] in ("waiting", "exchanging"):
                        pending["status"] = "expired"
                stop_callback(server)
            timer = threading.Timer(self.lifetime, expire)
            timer.daemon = True
            self.pending[state] = {"server": server, "redirect": redirect, "client_id": client_id, "expires": time.time() + self.lifetime, "status": "waiting", "timer": timer}
            threading.Thread(target=server.serve_forever, daemon=True).start()
            timer.start()
            challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
            return {"login_id": state, "url": AUTHORITY + "/oauth/authorize?" + urllib.parse.urlencode({"response_type": "code", "client_id": client_id, "redirect_uri": redirect, "state": state, "code_challenge": challenge, "code_challenge_method": "S256", "scope": "memq.mcp", "resource": RESOURCE})}

    def status(self, login_id):
        with self.lock:
            pending = self.pending.get(login_id)
            if not pending:
                raise Denied("unknown_login")
            if time.time() >= pending["expires"] and pending["status"] == "waiting":
                pending["status"] = "expired"
                threading.Thread(target=stop_callback, args=(pending["server"],), daemon=True).start()
            return {"status": pending["status"]}


class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        self.connection.settimeout(90)
        try:
            uid = peer_uid(self.connection)
            raw = self.rfile.readline(MAX_FRAME + 1)
            if len(raw) > MAX_FRAME or not raw.endswith(b"\n"):
                raise Denied("invalid_frame")
            request = strict_json(raw)
            exact_keys(request, {"kind", "tool", "arguments", "realm", "login_id"}, {"kind"})
            if request["kind"] == "tool":
                exact_keys(request, {"kind", "tool", "arguments"}, {"kind", "tool", "arguments"})
                result = self.server.broker.execute(uid, {"tool": request["tool"], "arguments": request["arguments"]})
            elif uid != 0:
                raise Denied("administrator_required")
            elif request["kind"] == "login":
                exact_keys(request, {"kind", "realm"}, {"kind", "realm"})
                result = self.server.oauth.begin(request["realm"])
            elif request["kind"] == "login_status":
                exact_keys(request, {"kind", "login_id"}, {"kind", "login_id"})
                result = self.server.oauth.status(request["login_id"])
            else:
                raise Denied("unknown_operation")
            response = {"ok": True, "result": result}
        except Exception as exc:
            code = str(exc) if isinstance(exc, Denied) else "broker_unavailable"
            response = {"ok": False, "error": code}
        self.wfile.write(json.dumps(response, allow_nan=False).encode() + b"\n")


class Server(socketserver.ThreadingUnixStreamServer):
    daemon_threads = True
    block_on_close = False

    def __init__(self, *args, **kwargs):
        self.slots = threading.BoundedSemaphore(16)
        super().__init__(*args, **kwargs)

    def process_request(self, request, address):
        if not self.slots.acquire(blocking=False):
            request.close()
            return
        try:
            super().process_request(request, address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.slots.release()


def connect(request, filename=SOCKET):
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as stream:
        stream.settimeout(90)
        stream.connect(filename)
        stream.sendall(json.dumps(request, allow_nan=False).encode() + b"\n")
        raw = stream.makefile("rb").readline(MAX_RESPONSE + 1)
        if len(raw) > MAX_RESPONSE:
            raise Denied("response_too_large")
        value = strict_json(raw)
        if value.get("ok") is not True:
            raise Denied(value.get("error", "broker_unavailable"))
        return value["result"]


def client():
    while True:
        raw = sys.stdin.buffer.readline(MAX_FRAME + 1)
        if not raw:
            break
        request = None
        try:
            if len(raw) > MAX_FRAME or not raw.endswith(b"\n"):
                raise Denied("invalid_frame")
            request = strict_json(raw)
            if not isinstance(request, dict) or request.get("jsonrpc") != "2.0":
                raise Denied("invalid_request")
            if request.get("id") is None:
                continue
            method = request.get("method")
            if method == "initialize":
                result = {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}, "serverInfo": {"name": "mnx-memq-broker", "version": "0.1.0"}}
            elif method == "tools/list":
                result = {"tools": TOOLS}
            elif method == "ping":
                result = {}
            elif method == "tools/call":
                try:
                    params = request.get("params")
                    exact_keys(params, {"name", "arguments"}, {"name", "arguments"})
                    value = connect({"kind": "tool", "tool": params["name"], "arguments": params["arguments"]})
                    result = {"content": [{"type": "text", "text": json.dumps(value, allow_nan=False)}]}
                except Exception:
                    result = {"isError": True, "content": [{"type": "text", "text": "Request denied or outcome unconfirmed. Read before retrying a write."}]}
            else:
                raise Denied("unsupported_method")
            response = {"jsonrpc": "2.0", "id": request["id"], "result": result}
        except Exception:
            response = {"jsonrpc": "2.0", "id": request.get("id") if isinstance(request, dict) else None, "error": {"code": -32600, "message": "Invalid or unsupported request"}}
        print(json.dumps(response, allow_nan=False), flush=True)
        if len(raw) > MAX_FRAME:
            break


def serve(filename):
    protected_file(filename, 0)
    with open(filename) as stream:
        policy = validate_policy(strict_json(stream.read(MAX_FRAME + 1)))
    state = policy["state_dir"]
    st = os.lstat(state)
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.geteuid() or st.st_mode & 0o077:
        raise Denied("unprotected_state_directory")
    credentials = CredentialStore(state)
    broker = Broker(policy, lambda name: Upstream(name, credentials, HTTP()), lambda event: append_audit(os.path.join(state, "audit.jsonl"), event))
    if os.path.lexists(policy["socket"]):
        st = os.lstat(policy["socket"])
        if not stat.S_ISSOCK(st.st_mode) or st.st_uid != os.geteuid():
            raise Denied("unsafe_socket_path")
        os.unlink(policy["socket"])
    server = Server(policy["socket"], Handler)
    os.chmod(policy["socket"], 0o666)  # Kernel UID authentication, never a bearer socket.
    server.broker = broker
    server.oauth = OAuth(broker, credentials, HTTP())
    try:
        server.serve_forever()
    finally:
        server.server_close()
        os.unlink(policy["socket"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--serve", metavar="ROOT_OWNED_POLICY")
    group.add_argument("--client", action="store_true")
    group.add_argument("--login", metavar="REALM")
    group.add_argument("--login-status", metavar="LOGIN_ID")
    options = parser.parse_args()
    try:
        if options.serve:
            serve(options.serve)
        elif options.client:
            client()
        elif options.login:
            print(json.dumps(connect({"kind": "login", "realm": options.login})))
        else:
            print(json.dumps(connect({"kind": "login_status", "login_id": options.login_status})))
    except Exception as error:
        print(str(error) if isinstance(error, Denied) else "Broker unavailable", file=sys.stderr)
        sys.exit(1)
