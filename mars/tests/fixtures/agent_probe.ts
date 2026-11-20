// A deliberately hostile agent. It runs inside the sandbox and reports what it was able to do.
import { GateClient } from "../../src/visa/client.ts";
import { AgentKey } from "../../src/visa/keys.ts";

const env = (name: string): string => Deno.env.get(name)!;

async function attempt(fn: () => unknown | Promise<unknown>): Promise<{ outcome: string; message: string }> {
  try {
    await fn();
    return { outcome: "allowed", message: "" };
  } catch (error) {
    return error instanceof Error
      ? { outcome: error.name, message: error.message.slice(0, 120) }
      : { outcome: "error", message: String(error).slice(0, 120) };
  }
}

const gateUrl = new URL(env("MARS_GATE_URL"));

const probes = {
  readFile: await attempt(() => Deno.readTextFile("/etc/hosts")),
  writeFile: await attempt(() => Deno.writeTextFile("/tmp/mars-sandbox-probe.txt", "x")),
  readEnv: await attempt(() => Deno.env.get("HOME")),
  spawn: await attempt(() => new Deno.Command("/bin/ls").output()),
  otherHost: await attempt(() => fetch("https://example.com/")),
  otherPort: await attempt(() => fetch(`http://127.0.0.1:${Number(gateUrl.port) + 1}/`)),
  listen: await attempt(() => Deno.listen({ hostname: "127.0.0.1", port: 0 })),
  remoteImport: await attempt(() => import("https://example.com/x.ts")),
};

const key = await AgentKey.import({ publicKey: env("MARS_AGENT_PUBLIC"), privateKey: env("MARS_AGENT_SECRET") });
const client = new GateClient({
  url: env("MARS_GATE_URL"),
  gateId: env("MARS_GATE_ID"),
  token: env("MARS_TOKEN"),
  key,
});

const gate = {
  inScope: await client.call("echo", "demo/hello", { n: 1 }),
  wrongResource: await client.call("echo", "secret/data"),
  wrongAction: await client.call("delete", "demo/hello"),
  traversal: await client.call("echo", "demo/../secret/data"),
};

console.log(JSON.stringify({ probes, gate }));
