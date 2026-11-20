// SPDX-License-Identifier: MIT (originally from the MARS repository; see mars/LICENSE-MIT)
/**
 * Minimal structured logger for kernel code.
 *
 * AI_RULES.md prohibits `console.log` in kernel/backend code. This logger writes
 * JSON lines to stdout/stderr without using console APIs, so logs remain usable
 * in Docker while staying compliant.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

type LogMeta = Record<string, unknown>;

const enc = new TextEncoder();

type SyncWriter = { writeSync(p: Uint8Array): number };

function writeLine(stream: SyncWriter, line: string) {
  try {
    stream.writeSync(enc.encode(line + "\n"));
  } catch {
    // Logging must never crash the kernel.
  }
}

export function log(level: LogLevel, message: string, meta: LogMeta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  const line = JSON.stringify(entry);
  if (level === "error") writeLine(Deno.stderr, line);
  else writeLine(Deno.stdout, line);
}
