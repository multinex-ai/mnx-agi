import { assert, assertEquals } from "@std/assert";
import { AgentKey, Gate, runSandboxed, serveGate, VisaIssuer } from "./mod.ts";

const DENIED = new Set(["NotCapable", "PermissionDenied"]);

async function withGate<T>(run: (ctx: { url: string; gate: Gate; issuer: VisaIssuer }) => Promise<T>): Promise<T> {
  const issuer = await VisaIssuer.generate("operator");
  const gate = new Gate({
    id: "gate-sandbox",
    trust: [issuer.trust()],
    handlers: { echo: (c) => ({ echoed: c.params, resource: c.resource }) },
  });
  const server = serveGate(gate);
  try {
    return await run({ url: server.url, gate, issuer });
  } finally {
    await server.close();
  }
}

Deno.test("HTTP: the gate serves only POST /v1/call and rejects oversized bodies", async () => {
  await withGate(async ({ url, issuer }) => {
    const key = await AgentKey.generate();
    const { token } = await issuer.issue({
      sub: "agent-1",
      aud: "gate-sandbox",
      agentPublicKey: key.publicKey,
      scope: [{ action: "echo", resource: "demo/*" }],
    });
    const { GateClient } = await import("./mod.ts");
    const client = new GateClient({ url, gateId: "gate-sandbox", token, key });
    assertEquals(await client.call("echo", "demo/x", { a: 1 }), {
      ok: true,
      result: { echoed: { a: 1 }, resource: "demo/x" },
    });
    assertEquals(await client.call("echo", "other/x"), { ok: false, code: "not_granted" });

    const get = await fetch(`${url}/v1/call`);
    assertEquals(get.status, 404);
    await get.body?.cancel();
    const wrongPath = await fetch(`${url}/admin`, { method: "POST", body: "{}" });
    assertEquals(wrongPath.status, 404);
    await wrongPath.body?.cancel();
    const huge = await fetch(`${url}/v1/call`, { method: "POST", body: "x".repeat(2 * 1024 * 1024) });
    assertEquals(huge.status, 413);
    await huge.body?.cancel();
  });
});

Deno.test("sandbox: a hostile agent can reach the gate and nothing else", async () => {
  await withGate(async ({ url, gate, issuer }) => {
    const key = await AgentKey.generate();
    const { token } = await issuer.issue({
      sub: "agent-probe",
      aud: "gate-sandbox",
      agentPublicKey: key.publicKey,
      scope: [{ action: "echo", resource: "demo/*" }],
    });
    const entry = decodeURIComponent(new URL("../../tests/fixtures/agent_probe.ts", import.meta.url).pathname);
    const run = await runSandboxed({
      entry,
      gateUrl: url,
      gateId: "gate-sandbox",
      token,
      agentPublicKey: key.publicKey,
      agentSecret: await key.exportSecret(),
    });
    assertEquals(run.code, 0, run.stderr);
    const report = JSON.parse(run.stdout.trim().split("\n").at(-1)!);

    // The runtime refused every operation that is not a connection to the gate.
    for (const [name, probe] of Object.entries(report.probes) as [string, { outcome: string; message: string }][]) {
      // The runtime reports a refused remote import as a TypeError whose message names the missing permission.
      const refused = DENIED.has(probe.outcome) ||
        (name === "remoteImport" && /Requires import access/.test(probe.message));
      assert(refused, `${name} was not refused: ${probe.outcome} ${probe.message}`);
    }

    // Through the gate, only the granted action on the granted resources works.
    assertEquals(report.gate.inScope, { ok: true, result: { echoed: { n: 1 }, resource: "demo/hello" } });
    assertEquals(report.gate.wrongResource, { ok: false, code: "not_granted" });
    assertEquals(report.gate.wrongAction, { ok: false, code: "not_granted" });
    assertEquals(report.gate.traversal, { ok: false, code: "not_granted" });

    // The gate saw and recorded all four attempts as the sandboxed agent.
    const entries = gate.audit.snapshot();
    assertEquals(entries.length, 4);
    assertEquals(entries.map((e) => e.decision), ["allow", "deny", "deny", "deny"]);
    assert(entries.every((e) => e.sub === "agent-probe"));
  });
});

Deno.test("sandbox: a runaway agent is stopped at the timeout", async () => {
  await withGate(async ({ url, issuer }) => {
    const key = await AgentKey.generate();
    const { token } = await issuer.issue({
      sub: "agent-slow",
      aud: "gate-sandbox",
      agentPublicKey: key.publicKey,
      scope: [{ action: "echo", resource: "demo/*" }],
    });
    const run = await runSandboxed({
      entry: decodeURIComponent(new URL("../../tests/fixtures/agent_hang.ts", import.meta.url).pathname),
      gateUrl: url,
      gateId: "gate-sandbox",
      token,
      agentPublicKey: key.publicKey,
      agentSecret: await key.exportSecret(),
      timeoutMs: 1500,
    });
    assertEquals(run.timedOut, true);
  });
});
