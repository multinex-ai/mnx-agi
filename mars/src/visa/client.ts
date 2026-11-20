import { b64urlEncode, randomHex, sha256Hex, utf8 } from "./encoding.ts";
import type { GateResult } from "./gate.ts";
import type { AgentKey } from "./keys.ts";

export interface GateClientOptions {
  /** Base URL of the gate, for example `http://127.0.0.1:8123`. */
  url: string;
  /** The gate's id; it is bound into every request. */
  gateId: string;
  /** The VISA the operator issued to this agent. */
  token: string;
  /** The key the VISA is bound to. */
  key: AgentKey;
  fetcher?: typeof fetch;
  now?: () => number;
}

/** What an agent uses to ask the gate for an action. It holds no authority of its own. */
export class GateClient {
  private readonly options: GateClientOptions;

  constructor(options: GateClientOptions) {
    this.options = options;
  }

  /** Build and sign one request. Exposed so tests can resend the exact bytes. */
  async envelope(action: string, resource: string, params?: unknown): Promise<string> {
    const { token, key, gateId } = this.options;
    const body = {
      v: 1,
      aud: gateId,
      th: await sha256Hex(utf8(token)),
      action,
      resource,
      params,
      nonce: randomHex(16),
      ts: (this.options.now ?? Date.now)(),
    };
    const req = b64urlEncode(utf8(JSON.stringify(body)));
    return JSON.stringify({ token, req, sig: await key.sign(utf8(req)) });
  }

  /** Throws only if the gate cannot be reached. A refusal comes back as `{ ok: false, code }`. */
  async call(action: string, resource: string, params?: unknown): Promise<GateResult> {
    const fetcher = this.options.fetcher ?? fetch;
    const response = await fetcher(`${this.options.url.replace(/\/+$/, "")}/v1/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await this.envelope(action, resource, params),
    });
    const data = await response.json();
    if (data && data.ok === true) return { ok: true, result: data.result };
    if (data && data.ok === false && typeof data.code === "string") return { ok: false, code: data.code };
    throw new Error("unexpected response from gate");
  }
}
