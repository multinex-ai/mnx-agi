import { b64urlDecode, b64urlEncode, fromUtf8, randomHex, utf8 } from "./encoding.ts";
import { VisaError } from "./errors.ts";
import { importPublicKey, verifySignature } from "./keys.ts";

const ED25519 = { name: "Ed25519" } as const;
const MAX_RESOURCE_LENGTH = 512;

/** One thing a VISA permits: an action on resources matching a pattern, optionally capped. */
export interface Grant {
  action: string;
  /** Exact resource, or a prefix ending in `/*` (for example `memory/team-a/*`). `*` alone means everything. */
  resource: string;
  /** Most calls this grant allows over the life of the VISA. */
  maxCalls?: number;
  /** Largest serialized `params` this grant accepts, in bytes. */
  maxBytes?: number;
}

export interface VisaClaims {
  v: 1;
  /** Issuer id. */
  iss: string;
  /** The one gate this VISA is valid at. A VISA for another gate is refused. */
  aud: string;
  /** Agent id. */
  sub: string;
  /** The agent's public key. Every request must be signed by the matching private key. */
  cnf: { x: string };
  scope: Grant[];
  /** Seconds since the epoch. */
  iat: number;
  nbf: number;
  exp: number;
  jti: string;
}

interface TokenHeader {
  alg: "EdDSA";
  typ: "mars-visa+json";
  kid: string;
}

/** A gate's pinned view of an issuer: only a public key it was given out of band. */
export interface TrustedIssuer {
  id: string;
  kid: string;
  /** Raw Ed25519 public key, base64url. */
  publicKey: string;
}

/** Returns a normalized resource, or null if it could be used for traversal or ambiguity. */
export function normalizeResource(resource: string): string | null {
  if (resource.length === 0 || resource.length > MAX_RESOURCE_LENGTH) return null;
  if (resource.includes("\0") || resource.includes("\\") || resource.startsWith("/")) return null;
  const segments = resource.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) return null;
  return resource;
}

export function isValidPattern(pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("/*")) return normalizeResource(pattern.slice(0, -2)) !== null;
  return normalizeResource(pattern) !== null && !pattern.includes("*");
}

export function resourceMatches(pattern: string, resource: string): boolean {
  if (normalizeResource(resource) === null) return false;
  if (pattern === "*") return true;
  if (pattern.endsWith("/*")) return resource.startsWith(pattern.slice(0, -1));
  return pattern === resource;
}

export interface IssueRequest {
  sub: string;
  aud: string;
  /** The agent's public key, from `AgentKey.publicKey`. */
  agentPublicKey: string;
  scope: Grant[];
  ttlSeconds?: number;
}

export interface IssuerOptions {
  /** Longest lifetime this issuer will grant. Default 900 seconds. */
  maxTtlSeconds?: number;
  /** Allow a `*` grant. Off by default, because it removes the point of scoping. */
  allowWildcard?: boolean;
  now?: () => number;
}

/** Holds the private key. Keep it in the operator's process, never in the agent's. */
export class VisaIssuer {
  readonly id: string;
  readonly kid: string;
  readonly publicKey: string;
  private readonly privateKey: CryptoKey;
  private readonly maxTtl: number;
  private readonly allowWildcard: boolean;
  private readonly now: () => number;

  private constructor(
    id: string,
    kid: string,
    publicKey: string,
    privateKey: CryptoKey,
    options: IssuerOptions,
  ) {
    this.id = id;
    this.kid = kid;
    this.publicKey = publicKey;
    this.privateKey = privateKey;
    this.maxTtl = options.maxTtlSeconds ?? 900;
    this.allowWildcard = options.allowWildcard ?? false;
    this.now = options.now ?? (() => Date.now());
  }

  static async generate(id: string, options: IssuerOptions = {}): Promise<VisaIssuer> {
    const pair = await crypto.subtle.generateKey(ED25519, false, ["sign", "verify"]) as CryptoKeyPair;
    const publicKey = b64urlEncode(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
    return new VisaIssuer(id, `${id}-${randomHex(4)}`, publicKey, pair.privateKey, options);
  }

  /** What a gate pins. Hand this over out of band; it is public. */
  trust(): TrustedIssuer {
    return { id: this.id, kid: this.kid, publicKey: this.publicKey };
  }

  async issue(request: IssueRequest): Promise<{ token: string; claims: VisaClaims }> {
    if (!request.sub || !request.aud) throw new Error("sub and aud are required");
    if (request.scope.length === 0) throw new Error("scope must grant at least one action");
    for (const grant of request.scope) {
      if (!grant.action || !isValidPattern(grant.resource)) throw new Error(`invalid grant for ${grant.action}`);
      if (grant.resource === "*" && !this.allowWildcard) throw new Error("wildcard grants are disabled");
    }
    const ttl = request.ttlSeconds ?? this.maxTtl;
    if (!Number.isInteger(ttl) || ttl < 1 || ttl > this.maxTtl) {
      throw new Error(`ttlSeconds must be between 1 and ${this.maxTtl}`);
    }
    const iat = Math.floor(this.now() / 1000);
    const claims: VisaClaims = {
      v: 1,
      iss: this.id,
      aud: request.aud,
      sub: request.sub,
      cnf: { x: request.agentPublicKey },
      scope: request.scope,
      iat,
      nbf: iat,
      exp: iat + ttl,
      jti: randomHex(16),
    };
    const header: TokenHeader = { alg: "EdDSA", typ: "mars-visa+json", kid: this.kid };
    const signingInput = `${b64urlEncode(utf8(JSON.stringify(header)))}.${b64urlEncode(utf8(JSON.stringify(claims)))}`;
    const signature = new Uint8Array(await crypto.subtle.sign(ED25519, this.privateKey, utf8(signingInput)));
    return { token: `${signingInput}.${b64urlEncode(signature)}`, claims };
  }
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(fromUtf8(bytes));
  } catch {
    throw new VisaError("malformed", "not JSON");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseGrants(value: unknown): Grant[] {
  if (!Array.isArray(value) || value.length === 0) throw new VisaError("malformed", "scope");
  return value.map((g) => {
    if (
      !isRecord(g) || typeof g.action !== "string" || typeof g.resource !== "string" || !isValidPattern(g.resource) ||
      (g.maxCalls !== undefined && (!Number.isInteger(g.maxCalls) || (g.maxCalls as number) < 1)) ||
      (g.maxBytes !== undefined && (!Number.isInteger(g.maxBytes) || (g.maxBytes as number) < 0))
    ) throw new VisaError("malformed", "grant");
    return {
      action: g.action,
      resource: g.resource,
      ...(g.maxCalls !== undefined ? { maxCalls: g.maxCalls as number } : {}),
      ...(g.maxBytes !== undefined ? { maxBytes: g.maxBytes as number } : {}),
    };
  });
}

/**
 * Check the issuer's signature against a pinned key and return the claims.
 * This proves who issued the VISA and that it was not altered. Time, audience and
 * revocation are the gate's job, because they depend on the gate's own state.
 */
export async function openToken(
  token: string,
  trusted: ReadonlyMap<string, TrustedIssuer>,
): Promise<{ claims: VisaClaims; signingInput: string }> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new VisaError("malformed", "token shape");
  const [h, c, s] = parts;
  let header: unknown;
  let body: unknown;
  try {
    header = parseJson(b64urlDecode(h));
    body = parseJson(b64urlDecode(c));
  } catch (e) {
    if (e instanceof VisaError) throw e;
    throw new VisaError("malformed", "token encoding");
  }
  if (
    !isRecord(header) || header.alg !== "EdDSA" || header.typ !== "mars-visa+json" || typeof header.kid !== "string"
  ) {
    throw new VisaError("malformed", "header");
  }
  const issuer = trusted.get(header.kid);
  if (!issuer) throw new VisaError("unknown_issuer");
  if (!await verifySignature(await importPublicKey(issuer.publicKey), utf8(`${h}.${c}`), s)) {
    throw new VisaError("bad_signature");
  }
  if (!isRecord(body)) throw new VisaError("malformed", "claims");
  const cnf = body.cnf;
  if (
    body.v !== 1 || typeof body.iss !== "string" || typeof body.aud !== "string" || typeof body.sub !== "string" ||
    typeof body.jti !== "string" || !isRecord(cnf) || typeof cnf.x !== "string" ||
    !Number.isInteger(body.iat) || !Number.isInteger(body.nbf) || !Number.isInteger(body.exp)
  ) throw new VisaError("malformed", "claims");
  if (body.iss !== issuer.id) throw new VisaError("unknown_issuer", "issuer does not match key");
  return {
    signingInput: `${h}.${c}`,
    claims: {
      v: 1,
      iss: body.iss,
      aud: body.aud,
      sub: body.sub,
      cnf: { x: cnf.x },
      scope: parseGrants(body.scope),
      iat: body.iat as number,
      nbf: body.nbf as number,
      exp: body.exp as number,
      jti: body.jti,
    },
  };
}
