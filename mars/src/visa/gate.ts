import { AuditLog } from "./audit.ts";
import { b64urlDecode, fromUtf8, sha256Hex, utf8 } from "./encoding.ts";
import { type DenyCode, VisaError } from "./errors.ts";
import { importPublicKey, verifySignature } from "./keys.ts";
import {
  type Grant,
  normalizeResource,
  openToken,
  resourceMatches,
  type TrustedIssuer,
  type VisaClaims,
} from "./token.ts";

export interface CallContext {
  sub: string;
  jti: string;
  action: string;
  resource: string;
  params: unknown;
}

export type Handler = (context: CallContext) => unknown | Promise<unknown>;

export type GateResult = { ok: true; result: unknown } | { ok: false; code: DenyCode };

export interface GateOptions {
  /** This gate's identity. A VISA is only accepted if its `aud` equals this. */
  id: string;
  /** Issuer public keys, pinned out of band. Nothing else is trusted. */
  trust: TrustedIssuer[];
  /** The only things the gate can do. An action with no handler is refused. */
  handlers: Record<string, Handler>;
  audit?: AuditLog;
  /** Tolerated clock difference for nbf/exp, in seconds. Default 30. */
  clockSkewSeconds?: number;
  /** Longest VISA lifetime the gate accepts regardless of issuer. Default 3600. */
  maxLifetimeSeconds?: number;
  /** How far a request timestamp may differ from now, in seconds. Default 60. */
  requestWindowSeconds?: number;
  /** Default 1 MiB. */
  maxRequestBytes?: number;
  /** Replay cache size. When full of live entries, requests are refused rather than accepted unchecked. Default 100000. */
  maxNonces?: number;
  now?: () => number;
}

interface RequestBody {
  v: 1;
  aud: string;
  th: string;
  action: string;
  resource: string;
  params: unknown;
  nonce: string;
  ts: number;
}

interface Envelope {
  token: string;
  req: string;
  sig: string;
}

const NONCE = /^[0-9a-f]{16,64}$/;

/**
 * The acceptor. It is the only path to the handlers it was given, and it admits a
 * request only if every check passes: the VISA was signed by a pinned issuer, is meant for
 * this gate, is within its time window and not revoked, the request is signed by the
 * key the VISA is bound to, is fresh and unseen, and a grant covers the exact action
 * and resource. Run it in a different process from the agent.
 */
export class Gate {
  readonly id: string;
  readonly audit: AuditLog;
  private readonly trusted: Map<string, TrustedIssuer>;
  private readonly handlers: Map<string, Handler>;
  private readonly skew: number;
  private readonly maxLifetime: number;
  private readonly window: number;
  private readonly maxBytes: number;
  private readonly maxNonces: number;
  private readonly now: () => number;
  private readonly nonces = new Map<string, number>();
  private readonly calls = new Map<string, { count: number; exp: number }>();
  private readonly revokedTokens = new Set<string>();
  private readonly revokedSubjects = new Set<string>();

  constructor(options: GateOptions) {
    this.id = options.id;
    this.audit = options.audit ?? new AuditLog();
    this.trusted = new Map(options.trust.map((t) => [t.kid, t]));
    this.handlers = new Map(Object.entries(options.handlers));
    this.skew = options.clockSkewSeconds ?? 30;
    this.maxLifetime = options.maxLifetimeSeconds ?? 3600;
    this.window = options.requestWindowSeconds ?? 60;
    this.maxBytes = options.maxRequestBytes ?? 1024 * 1024;
    this.maxNonces = options.maxNonces ?? 100_000;
    this.now = options.now ?? (() => Date.now());
  }

  revoke(jti: string): void {
    this.revokedTokens.add(jti);
  }

  revokeSubject(sub: string): void {
    this.revokedSubjects.add(sub);
  }

  /** Takes the raw request envelope, returns a decision. Never throws. */
  async handle(raw: string): Promise<GateResult> {
    let who = { sub: "?", jti: "?", action: "?", resource: "?", params: undefined as unknown };
    try {
      const result = await this.decide(raw, (w) => {
        who = { ...who, ...w };
      });
      await this.record("allow", undefined, who);
      return result;
    } catch (error) {
      const code: DenyCode = error instanceof VisaError ? error.code : "malformed";
      await this.record("deny", code, who);
      return { ok: false, code };
    }
  }

  private async record(
    decision: "allow" | "deny",
    code: DenyCode | undefined,
    who: { sub: string; jti: string; action: string; resource: string; params: unknown },
  ): Promise<void> {
    await this.audit.append({
      ts: this.now(),
      decision,
      ...(code ? { code } : {}),
      sub: who.sub,
      jti: who.jti,
      action: who.action,
      resource: who.resource,
      paramsSha256: await sha256Hex(utf8(JSON.stringify(who.params ?? null))),
    });
  }

  private async decide(
    raw: string,
    note: (w: Partial<{ sub: string; jti: string; action: string; resource: string; params: unknown }>) => void,
  ): Promise<GateResult> {
    if (utf8(raw).length > this.maxBytes) throw new VisaError("payload_too_large");
    const envelope = this.parseEnvelope(raw);

    // 1. Who issued the VISA, and was it altered.
    const { claims } = await openToken(envelope.token, this.trusted);
    note({ sub: claims.sub, jti: claims.jti });

    // 2. Is it for this gate, in its time window, and not revoked.
    const nowSeconds = Math.floor(this.now() / 1000);
    if (claims.aud !== this.id) throw new VisaError("wrong_audience");
    if (nowSeconds + this.skew < claims.nbf) throw new VisaError("not_yet_valid");
    if (nowSeconds - this.skew > claims.exp) throw new VisaError("expired");
    if (claims.exp - claims.iat > this.maxLifetime || claims.exp <= claims.iat) {
      throw new VisaError("lifetime_too_long");
    }
    if (this.revokedTokens.has(claims.jti) || this.revokedSubjects.has(claims.sub)) throw new VisaError("revoked");

    // 3. Is the request signed by the key the VISA is bound to, and bound to this VISA.
    let agentKey: CryptoKey;
    try {
      agentKey = await importPublicKey(claims.cnf.x);
    } catch {
      throw new VisaError("malformed", "bound key");
    }
    if (!await verifySignature(agentKey, utf8(envelope.req), envelope.sig)) {
      throw new VisaError("bad_request_signature");
    }
    const request = this.parseRequest(envelope.req);
    note({ action: request.action, resource: request.resource, params: request.params });
    if (request.aud !== this.id) throw new VisaError("wrong_audience");
    if (request.th !== await sha256Hex(utf8(envelope.token))) throw new VisaError("token_binding_mismatch");

    // 4. Is the request fresh.
    if (Math.abs(this.now() - request.ts) > this.window * 1000) throw new VisaError("stale_request");

    // 5. Does a grant cover this exact action and resource.
    const resource = normalizeResource(request.resource);
    if (resource === null) throw new VisaError("not_granted", "resource");
    const paramsBytes = utf8(JSON.stringify(request.params ?? null)).length;
    const grantIndex = claims.scope.findIndex((g) =>
      g.action === request.action && resourceMatches(g.resource, resource)
    );
    if (grantIndex === -1) throw new VisaError("not_granted");
    const grant = claims.scope[grantIndex];
    if (grant.maxBytes !== undefined && paramsBytes > grant.maxBytes) throw new VisaError("payload_too_large");
    const handler = this.handlers.get(request.action);
    if (!handler) throw new VisaError("unknown_action");

    // 6. Replay and budget. Everything above awaited; this block does not, so concurrent
    //    requests cannot interleave between the check and the update.
    this.admit(claims, grantIndex, grant, request);

    try {
      const result = await handler({
        sub: claims.sub,
        jti: claims.jti,
        action: request.action,
        resource,
        params: request.params,
      });
      return { ok: true, result };
    } catch {
      throw new VisaError("handler_error");
    }
  }

  /** Synchronous on purpose: see the note in decide(). */
  private admit(claims: VisaClaims, grantIndex: number, grant: Grant, request: RequestBody): void {
    const nowMs = this.now();
    const key = `${claims.jti}:${request.nonce}`;
    if (this.nonces.has(key)) throw new VisaError("replay");
    if (this.nonces.size >= this.maxNonces) {
      for (const [k, expires] of this.nonces) if (expires <= nowMs) this.nonces.delete(k);
      if (this.nonces.size >= this.maxNonces) throw new VisaError("replay_cache_full");
    }
    const counterKey = `${claims.jti}#${grantIndex}`;
    const used = this.calls.get(counterKey)?.count ?? 0;
    if (grant.maxCalls !== undefined && used >= grant.maxCalls) throw new VisaError("budget_exhausted");
    this.nonces.set(key, nowMs + (this.window + this.skew) * 1000 * 2);
    this.calls.set(counterKey, { count: used + 1, exp: claims.exp });
    if (this.calls.size > 10_000) {
      const nowSeconds = Math.floor(nowMs / 1000);
      for (const [k, v] of this.calls) if (v.exp + this.skew < nowSeconds) this.calls.delete(k);
    }
  }

  private parseEnvelope(raw: string): Envelope {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new VisaError("malformed", "envelope");
    }
    if (
      typeof value !== "object" || value === null || typeof (value as Envelope).token !== "string" ||
      typeof (value as Envelope).req !== "string" || typeof (value as Envelope).sig !== "string"
    ) throw new VisaError("malformed", "envelope");
    return value as Envelope;
  }

  private parseRequest(req: string): RequestBody {
    let value: unknown;
    try {
      value = JSON.parse(fromUtf8(b64urlDecode(req)));
    } catch {
      throw new VisaError("malformed", "request");
    }
    const r = value as Partial<RequestBody> | null;
    if (
      typeof r !== "object" || r === null || r.v !== 1 || typeof r.aud !== "string" || typeof r.th !== "string" ||
      typeof r.action !== "string" || typeof r.resource !== "string" || typeof r.nonce !== "string" ||
      !NONCE.test(r.nonce) || !Number.isFinite(r.ts)
    ) throw new VisaError("malformed", "request");
    return r as RequestBody;
  }
}
