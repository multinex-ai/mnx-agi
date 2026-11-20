/**
 * @module loop
 *
 * The MARS work loop: PERCEIVE once, then PLAN, EXECUTE and REFLECT up to a fixed
 * number of times, stopping as soon as a reflection grades the attempt as passing.
 *
 * The loop always closes. A weak grade sends it back to PLAN, but only while the
 * attempt budget lasts; after that it returns `exhausted` with every attempt kept, so
 * a caller (or an outer loop) decides what to do next. An abort signal stops it between
 * phases. A grade that is not S, A, B or F counts as F.
 *
 * Loops compose: an `execute` phase can run a whole inner loop and turn its result
 * into an output, and a `reflect` phase can grade from the inner result. Each level
 * has its own bound, so nesting cannot run away.
 *
 * Phases are plain async functions you supply. This module makes no model calls and
 * needs no permissions. Errors thrown by a phase propagate to the caller.
 */

export type Grade = "S" | "A" | "B" | "F";

export interface Reflection {
  grade: Grade;
  notes?: string;
}

export interface Attempt<Plan, Output> {
  attempt: number;
  plan: Plan;
  output: Output;
  reflection: Reflection;
}

export interface LoopPhases<Context, Plan, Output> {
  perceive(input: { task: string; signal?: AbortSignal }): Promise<Context>;
  plan(input: {
    task: string;
    context: Context;
    attempt: number;
    previous: readonly Attempt<Plan, Output>[];
  }): Promise<Plan>;
  execute(input: { plan: Plan; attempt: number; signal?: AbortSignal }): Promise<Output>;
  reflect(input: { task: string; plan: Plan; output: Output; attempt: number }): Promise<Reflection>;
}

export interface LoopOptions {
  /** Attempts allowed, clamped to 1..10. Default 3. */
  maxAttempts?: number;
  /** Grades that end the loop. Default S and A. */
  passing?: readonly Grade[];
  signal?: AbortSignal;
}

export interface LoopResult<Plan, Output> {
  status: "passed" | "exhausted" | "aborted";
  attempts: Attempt<Plan, Output>[];
}

export const DEFAULT_MAX_ATTEMPTS = 3;
export const HARD_MAX_ATTEMPTS = 10;

const GRADES: readonly Grade[] = ["S", "A", "B", "F"];

function normalizeGrade(value: unknown): Grade {
  return GRADES.includes(value as Grade) ? (value as Grade) : "F";
}

export function clampAttempts(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_MAX_ATTEMPTS;
  return Math.min(Math.max(Math.floor(requested), 1), HARD_MAX_ATTEMPTS);
}

export async function runLoop<Context, Plan, Output>(
  task: string,
  phases: LoopPhases<Context, Plan, Output>,
  options: LoopOptions = {},
): Promise<LoopResult<Plan, Output>> {
  const maxAttempts = clampAttempts(options.maxAttempts);
  const passing = new Set<Grade>(options.passing ?? ["S", "A"]);
  const { signal } = options;
  const attempts: Attempt<Plan, Output>[] = [];

  if (signal?.aborted) return { status: "aborted", attempts };
  const context = await phases.perceive({ task, signal });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) return { status: "aborted", attempts };
    const plan = await phases.plan({ task, context, attempt, previous: attempts });
    if (signal?.aborted) return { status: "aborted", attempts };
    const output = await phases.execute({ plan, attempt, signal });
    const reflected = await phases.reflect({ task, plan, output, attempt });
    const reflection: Reflection = { ...reflected, grade: normalizeGrade(reflected?.grade) };
    attempts.push({ attempt, plan, output, reflection });
    if (passing.has(reflection.grade)) return { status: "passed", attempts };
  }
  return { status: "exhausted", attempts };
}
