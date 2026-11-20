import { assert, assertEquals, assertRejects } from "@std/assert";
import { AuditLog, b64Pair } from "./test_support.ts";
import { AgentKey, Gate, GateClient, type GateOptions, type Grant, type IssuerOptions, VisaIssuer } from "./mod.ts";

const GATE_ID = "gate-a";

async function setup(options: { gate?: Partial<GateOptions>; issuer?: IssuerOptions } = {}) {
  let clock = Date.now();
  const now = () => clock;
  const issuer = await VisaIssuer.generate("operator", { now, ...options.issuer });
  const handlers = {
    echo: (c: { params: unknown; resource: string; sub: string }) => ({
      echoed: c.params,
      resource: c.resource,
      sub: c.sub,
    }),
    boom: () => {
      throw new Error("secret internal detail");
    },
  };
  const gate = new Gate({ id: GATE_ID, trust: [issuer.trust()], handlers, now, ...options.gate });
  const key = await AgentKey.generate();
  const issue = (scope: Grant[], extra: { ttlSeconds?: number; aud?: string; sub?: string } = {}) =>
    issuer.issue({
      sub: extra.sub ?? "agent-1",
      aud: extra.aud ?? GATE_ID,
      agentPublicKey: key.publicKey,
      scope,
      ttlSeconds: extra.ttlSeconds,
    });
  const client = (token: string, signer: AgentKey = key) =>
    new GateClient({ url: "http://unused", gateId: GATE_ID, token, key: signer, now });
  return { gate, issuer, key, issue, client, advance: (ms: number) => (clock += ms), handlers };
}

const ECHO_DEMO: Grant[] = [{ action: "echo", resource: "demo/*" }];

Deno.test("an in-scope request is allowed and its handler runs", async () => {
  const s = await setup();
  const { token } = await s.issue(ECHO_DEMO);
  const result = await s.gate.handle(await s.client(token).envelope("echo", "demo/hello", { n: 1 }));
  assertEquals(result, { ok: true, result: { echoed: { n: 1 }, resource: "demo/hello", sub: "agent-1" } });
});

Deno.test("anything not granted is refused: wrong resource, wrong action, prefix boundary, traversal", async () => {
  const s = await setup();
  const { token } = await s.issue(ECHO_DEMO);
  const c = s.client(token);
  for (
    const [action, resource] of [
      ["echo", "secret/data"],
      ["delete", "demo/hello"],
      ["echo", "demonstration/x"],
      ["echo", "demo"],
      ["echo", "demo/../secret/data"],
      ["echo", "/demo/hello"],
      ["echo", "demo//hello"],
      ["echo", "demo\\hello"],
    ]
  ) {
    assertEquals(
      await s.gate.handle(await c.envelope(action, resource)),
      { ok: false, code: "not_granted" },
      `${action} ${resource}`,
    );
  }
});

Deno.test("a VISA for another gate is refused", async () => {
  const s = await setup();
  const { token } = await s.issue(ECHO_DEMO, { aud: "gate-b" });
  assertEquals(await s.gate.handle(await s.client(token).envelope("echo", "demo/x")), {
    ok: false,
    code: "wrong_audience",
  });
});

Deno.test("expired and not-yet-valid VISAs are refused, with bounded clock skew", async () => {
  const s = await setup();
  const { token } = await s.issue(ECHO_DEMO, { ttlSeconds: 60 });
  assertEquals((await s.gate.handle(await s.client(token).envelope("echo", "demo/x"))).ok, true);
  s.advance((60 + 31) * 1000);
  assertEquals(await s.gate.handle(await s.client(token).envelope("echo", "demo/y")), { ok: false, code: "expired" });

  const early = await setup();
  const future = await VisaIssuer.generate("operator", { now: () => Date.now() + 600_000 });
  const gate = new Gate({ id: GATE_ID, trust: [future.trust()], handlers: early.handlers });
  const key = await AgentKey.generate();
  const issued = await future.issue({ sub: "a", aud: GATE_ID, agentPublicKey: key.publicKey, scope: ECHO_DEMO });
  const envelope = await new GateClient({ url: "http://unused", gateId: GATE_ID, token: issued.token, key }).envelope(
    "echo",
    "demo/x",
  );
  assertEquals(await gate.handle(envelope), { ok: false, code: "not_yet_valid" });
});

Deno.test("the gate caps lifetime itself, whatever the issuer allows", async () => {
  const s = await setup({ issuer: { maxTtlSeconds: 7200 }, gate: { maxLifetimeSeconds: 3600 } });
  const { token } = await s.issue(ECHO_DEMO, { ttlSeconds: 7200 });
  assertEquals(await s.gate.handle(await s.client(token).envelope("echo", "demo/x")), {
    ok: false,
    code: "lifetime_too_long",
  });
});

Deno.test("a stolen VISA is useless without the agent's key", async () => {
  const s = await setup();
  const { token } = await s.issue(ECHO_DEMO);
  const thief = await AgentKey.generate();
  assertEquals(await s.gate.handle(await s.client(token, thief).envelope("echo", "demo/x")), {
    ok: false,
    code: "bad_request_signature",
  });
});

Deno.test("a request cannot be moved onto a different VISA", async () => {
  const s = await setup();
  const first = await s.issue(ECHO_DEMO);
  const second = await s.issue(ECHO_DEMO);
  const envelope = JSON.parse(await s.client(first.token).envelope("echo", "demo/x"));
  const swapped = JSON.stringify({ ...envelope, token: second.token });
  assertEquals(await s.gate.handle(swapped), { ok: false, code: "token_binding_mismatch" });
});

Deno.test("a tampered VISA fails: widened scope, reused signature, wrong key, alg none", async () => {
  const s = await setup();
  const { token } = await s.issue(ECHO_DEMO);
  const [h, c, sig] = token.split(".");
  const claims = JSON.parse(new TextDecoder().decode(b64Pair.decode(c)));
  claims.scope = [{ action: "echo", resource: "*" }];
  const widened = `${h}.${b64Pair.encode(new TextEncoder().encode(JSON.stringify(claims)))}.${sig}`;
  assertEquals(await s.gate.handle(await s.client(widened).envelope("echo", "secret/x")), {
    ok: false,
    code: "bad_signature",
  });

  const evil = await VisaIssuer.generate("operator");
  const forged =
    (await evil.issue({ sub: "agent-1", aud: GATE_ID, agentPublicKey: s.key.publicKey, scope: ECHO_DEMO })).token;
  assertEquals(await s.gate.handle(await s.client(forged).envelope("echo", "demo/x")), {
    ok: false,
    code: "unknown_issuer",
  });

  const [, fc, fs] = forged.split(".");
  const header = b64Pair.encode(
    new TextEncoder().encode(JSON.stringify({ alg: "EdDSA", typ: "mars-visa+json", kid: s.issuer.kid })),
  );
  assertEquals(await s.gate.handle(await s.client(`${header}.${fc}.${fs}`).envelope("echo", "demo/x")), {
    ok: false,
    code: "bad_signature",
  });

  const none = b64Pair.encode(
    new TextEncoder().encode(JSON.stringify({ alg: "none", typ: "mars-visa+json", kid: s.issuer.kid })),
  );
  assertEquals(await s.gate.handle(await s.client(`${none}.${c}.`).envelope("echo", "demo/x")), {
    ok: false,
    code: "malformed",
  });
});

Deno.test("an exact resend is a replay; concurrent resends admit exactly one", async () => {
  const s = await setup();
  const { token } = await s.issue(ECHO_DEMO);
  const envelope = await s.client(token).envelope("echo", "demo/x");
  assertEquals((await s.gate.handle(envelope)).ok, true);
  assertEquals(await s.gate.handle(envelope), { ok: false, code: "replay" });

  const racing = await s.client(token).envelope("echo", "demo/y");
  const results = await Promise.all(Array.from({ length: 6 }, () => s.gate.handle(racing)));
  assertEquals(results.filter((r) => r.ok).length, 1);
  assertEquals(results.filter((r) => !r.ok && r.code === "replay").length, 5);
});

Deno.test("a stale request is refused", async () => {
  const s = await setup();
  const { token } = await s.issue(ECHO_DEMO);
  const envelope = await s.client(token).envelope("echo", "demo/x");
  s.advance(120_000);
  assertEquals(await s.gate.handle(envelope), { ok: false, code: "stale_request" });
});

Deno.test("a full replay cache refuses new requests instead of skipping the check, then recovers", async () => {
  const s = await setup({ gate: { maxNonces: 2 } });
  const { token } = await s.issue(ECHO_DEMO);
  const c = s.client(token);
  assertEquals((await s.gate.handle(await c.envelope("echo", "demo/1"))).ok, true);
  assertEquals((await s.gate.handle(await c.envelope("echo", "demo/2"))).ok, true);
  assertEquals(await s.gate.handle(await c.envelope("echo", "demo/3")), { ok: false, code: "replay_cache_full" });
  s.advance(200_000);
  const fresh = await s.issue(ECHO_DEMO);
  assertEquals((await s.gate.handle(await s.client(fresh.token).envelope("echo", "demo/4"))).ok, true);
});

Deno.test("call and size budgets are enforced", async () => {
  const s = await setup();
  const { token } = await s.issue([{ action: "echo", resource: "demo/*", maxCalls: 2, maxBytes: 20 }]);
  const c = s.client(token);
  assertEquals((await s.gate.handle(await c.envelope("echo", "demo/a", "ok"))).ok, true);
  assertEquals(await s.gate.handle(await c.envelope("echo", "demo/a", "x".repeat(50))), {
    ok: false,
    code: "payload_too_large",
  });
  assertEquals((await s.gate.handle(await c.envelope("echo", "demo/b", "ok"))).ok, true);
  assertEquals(await s.gate.handle(await c.envelope("echo", "demo/c", "ok")), { ok: false, code: "budget_exhausted" });
});

Deno.test("revoking a VISA or an agent takes effect on the next request", async () => {
  const s = await setup();
  const a = await s.issue(ECHO_DEMO);
  assertEquals((await s.gate.handle(await s.client(a.token).envelope("echo", "demo/x"))).ok, true);
  s.gate.revoke(a.claims.jti);
  assertEquals(await s.gate.handle(await s.client(a.token).envelope("echo", "demo/y")), { ok: false, code: "revoked" });

  const b = await s.issue(ECHO_DEMO, { sub: "agent-2" });
  s.gate.revokeSubject("agent-2");
  assertEquals(await s.gate.handle(await s.client(b.token).envelope("echo", "demo/x")), { ok: false, code: "revoked" });
});

Deno.test("a granted action with no handler is refused, and a handler error leaks nothing", async () => {
  const s = await setup();
  const { token } = await s.issue([{ action: "ghost", resource: "demo/*" }, { action: "boom", resource: "demo/*" }]);
  assertEquals(await s.gate.handle(await s.client(token).envelope("ghost", "demo/x")), {
    ok: false,
    code: "unknown_action",
  });
  const result = await s.gate.handle(await s.client(token).envelope("boom", "demo/x"));
  assertEquals(result, { ok: false, code: "handler_error" });
  assert(!JSON.stringify(result).includes("secret internal detail"));
});

Deno.test("garbage and oversized input are refused and never throw", async () => {
  const s = await setup({ gate: { maxRequestBytes: 2000 } });
  for (const raw of ["", "not json", "{}", '{"token":1,"req":2,"sig":3}', "null", "[]"]) {
    const result = await s.gate.handle(raw);
    assertEquals(result.ok, false, raw);
  }
  assertEquals(await s.gate.handle("x".repeat(5000)), { ok: false, code: "payload_too_large" });
});

Deno.test("the issuer refuses unsafe VISAs: long ttl, wildcard, bad patterns, empty scope", async () => {
  const s = await setup();
  const key = s.key.publicKey;
  const base = { sub: "a", aud: GATE_ID, agentPublicKey: key };
  await assertRejects(() => s.issuer.issue({ ...base, scope: ECHO_DEMO, ttlSeconds: 901 }));
  await assertRejects(() => s.issuer.issue({ ...base, scope: ECHO_DEMO, ttlSeconds: 0 }));
  await assertRejects(() => s.issuer.issue({ ...base, scope: [{ action: "echo", resource: "*" }] }));
  await assertRejects(() => s.issuer.issue({ ...base, scope: [] }));
  for (const resource of ["a/*/b", "../x", "/abs", "a//b", "a/./b", "", "demo*"]) {
    await assertRejects(
      () => s.issuer.issue({ ...base, scope: [{ action: "echo", resource }] }),
      Error,
      "invalid grant",
      resource,
    );
  }
  const permissive = await setup({ issuer: { allowWildcard: true } });
  assert((await permissive.issuer.issue({ ...base, scope: [{ action: "echo", resource: "*" }] })).token.length > 0);
});

Deno.test("every decision is audited in a tamper-evident chain, without logging params", async () => {
  const s = await setup();
  const { token } = await s.issue(ECHO_DEMO);
  const c = s.client(token);
  await s.gate.handle(await c.envelope("echo", "demo/x", { password: "hunter2" }));
  await s.gate.handle(await c.envelope("echo", "secret/x"));
  await s.gate.handle("garbage");
  const entries = s.gate.audit.snapshot();
  assertEquals(entries.map((e) => [e.decision, e.code]), [["allow", undefined], ["deny", "not_granted"], [
    "deny",
    "malformed",
  ]]);
  assertEquals(await AuditLog.verify(entries), { ok: true });
  assert(!JSON.stringify(entries).includes("hunter2"));

  const edited = entries.map((e) => ({ ...e }));
  edited[1].decision = "allow";
  assertEquals(await AuditLog.verify(edited), { ok: false, at: 1 });
  assertEquals((await AuditLog.verify([entries[0], entries[2]])).ok, false);
});
