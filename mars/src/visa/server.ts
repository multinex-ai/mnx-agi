import type { Gate } from "./gate.ts";

export interface GateServer {
  url: string;
  port: number;
  close(): Promise<void>;
}

export interface ServeOptions {
  /** Loopback by default. Reachability is not what protects the gate; the checks are. */
  hostname?: string;
  port?: number;
  maxRequestBytes?: number;
}

async function readLimited(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > limit) return null;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(all);
}

export function serveGate(gate: Gate, options: ServeOptions = {}): GateServer {
  const hostname = options.hostname ?? "127.0.0.1";
  const limit = options.maxRequestBytes ?? 1024 * 1024;
  const server = Deno.serve({ hostname, port: options.port ?? 0, onListen: () => {} }, async (request) => {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/v1/call") {
      return new Response("not found", { status: 404 });
    }
    const body = await readLimited(request, limit);
    if (body === null) return Response.json({ ok: false, code: "payload_too_large" }, { status: 413 });
    const result = await gate.handle(body);
    try {
      return Response.json(result, { status: result.ok ? 200 : 403 });
    } catch {
      return Response.json({ ok: false, code: "handler_error" }, { status: 500 });
    }
  });
  const port = (server.addr as Deno.NetAddr).port;
  return {
    url: `http://${hostname}:${port}`,
    port,
    close: () => server.shutdown(),
  };
}
