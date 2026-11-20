import { sha256Hex, utf8 } from "./encoding.ts";
import type { DenyCode } from "./errors.ts";

export interface AuditEntry {
  seq: number;
  /** Milliseconds since the epoch. */
  ts: number;
  decision: "allow" | "deny";
  /** Present on deny. */
  code?: DenyCode;
  sub: string;
  jti: string;
  action: string;
  resource: string;
  /** SHA-256 of the serialized params. The params themselves are never logged. */
  paramsSha256: string;
  prevHash: string;
  hash: string;
}

export type AuditInput = Omit<AuditEntry, "seq" | "prevHash" | "hash">;

const GENESIS = "0".repeat(64);

function body(entry: Omit<AuditEntry, "hash">): string {
  // Fixed field order so the hash is reproducible.
  return JSON.stringify([
    entry.seq,
    entry.ts,
    entry.decision,
    entry.code ?? null,
    entry.sub,
    entry.jti,
    entry.action,
    entry.resource,
    entry.paramsSha256,
    entry.prevHash,
  ]);
}

/**
 * Append-only, hash-chained record of every decision, allow and deny alike.
 * Editing, removing or reordering an entry breaks the chain from that point on.
 * It detects tampering; it does not prevent it. Ship entries off the host to be sure.
 */
export class AuditLog {
  private readonly entries: AuditEntry[] = [];
  private readonly onEntry?: (entry: AuditEntry) => void;

  constructor(onEntry?: (entry: AuditEntry) => void) {
    this.onEntry = onEntry;
  }

  async append(input: AuditInput): Promise<AuditEntry> {
    const prev = this.entries.at(-1);
    const partial = { ...input, seq: this.entries.length, prevHash: prev?.hash ?? GENESIS };
    const entry: AuditEntry = { ...partial, hash: await sha256Hex(utf8(body(partial))) };
    this.entries.push(entry);
    try {
      this.onEntry?.(entry);
    } catch {
      // A failing sink must not change a decision.
    }
    return entry;
  }

  snapshot(): readonly AuditEntry[] {
    return [...this.entries];
  }

  static async verify(entries: readonly AuditEntry[]): Promise<{ ok: true } | { ok: false; at: number }> {
    let prevHash = GENESIS;
    for (let i = 0; i < entries.length; i++) {
      const { hash, ...rest } = entries[i];
      if (rest.seq !== i || rest.prevHash !== prevHash || hash !== await sha256Hex(utf8(body(rest)))) {
        return { ok: false, at: i };
      }
      prevHash = hash;
    }
    return { ok: true };
  }
}
