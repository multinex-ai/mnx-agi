import { assertEquals, assertRejects } from "@std/assert";
import { clampAttempts, type Grade, type LoopPhases, runLoop } from "./loop.ts";

function phasesGrading(
  grades: Grade[],
  seen: { plans: number[]; previousLengths: number[] } = { plans: [], previousLengths: [] },
) {
  let i = 0;
  const phases: LoopPhases<string, string, string> = {
    perceive: async ({ task }) => `ctx:${task}`,
    plan: async ({ attempt, previous }) => {
      seen.plans.push(attempt);
      seen.previousLengths.push(previous.length);
      return `plan-${attempt}`;
    },
    execute: async ({ plan }) => `out:${plan}`,
    reflect: async () => ({ grade: grades[Math.min(i++, grades.length - 1)] }),
  };
  return { phases, seen };
}

Deno.test("stops at the first passing grade", async () => {
  const { phases, seen } = phasesGrading(["F", "B", "A", "S"]);
  const result = await runLoop("t", phases);
  assertEquals(result.status, "passed");
  assertEquals(result.attempts.map((a) => a.reflection.grade), ["F", "B", "A"]);
  assertEquals(seen.plans, [1, 2, 3]);
});

Deno.test("each retry sees the attempts before it", async () => {
  const { phases, seen } = phasesGrading(["F", "F", "S"]);
  await runLoop("t", phases);
  assertEquals(seen.previousLengths, [0, 1, 2]);
});

Deno.test("a persistently weak grade ends in exhausted, never an endless loop", async () => {
  const { phases, seen } = phasesGrading(["F"]);
  const result = await runLoop("t", phases, { maxAttempts: 4 });
  assertEquals(result.status, "exhausted");
  assertEquals(result.attempts.length, 4);
  assertEquals(seen.plans.length, 4);
});

Deno.test("the attempt budget is clamped to 1..10 with a default of 3", () => {
  assertEquals(clampAttempts(undefined), 3);
  assertEquals(clampAttempts(0), 1);
  assertEquals(clampAttempts(-5), 1);
  assertEquals(clampAttempts(1000), 10);
  assertEquals(clampAttempts(2.9), 2);
  assertEquals(clampAttempts(NaN), 3);
});

Deno.test("an invalid grade counts as F", async () => {
  const { phases } = phasesGrading(["S"]);
  const bad: LoopPhases<string, string, string> = {
    ...phases,
    reflect: async () => ({ grade: "excellent" as unknown as Grade }),
  };
  const result = await runLoop("t", bad, { maxAttempts: 2 });
  assertEquals(result.status, "exhausted");
  assertEquals(result.attempts[0].reflection.grade, "F");
});

Deno.test("passing grades are configurable", async () => {
  const { phases } = phasesGrading(["B"]);
  const result = await runLoop("t", phases, { passing: ["B", "A", "S"] });
  assertEquals(result.status, "passed");
  assertEquals(result.attempts.length, 1);
});

Deno.test("an abort stops the loop between phases and keeps what finished", async () => {
  const controller = new AbortController();
  const { phases } = phasesGrading(["F"]);
  const aborting: LoopPhases<string, string, string> = {
    ...phases,
    reflect: async () => {
      controller.abort();
      return { grade: "F" };
    },
  };
  const result = await runLoop("t", aborting, { signal: controller.signal });
  assertEquals(result.status, "aborted");
  assertEquals(result.attempts.length, 1);

  const already = new AbortController();
  already.abort();
  assertEquals((await runLoop("t", phases, { signal: already.signal })).attempts.length, 0);
});

Deno.test("a phase error propagates instead of being swallowed", async () => {
  const { phases } = phasesGrading(["S"]);
  const broken: LoopPhases<string, string, string> = {
    ...phases,
    execute: async () => {
      throw new Error("tool failed");
    },
  };
  await assertRejects(() => runLoop("t", broken), Error, "tool failed");
});

Deno.test("loops nest: an inner loop's result decides the outer grade, each level bounded", async () => {
  let innerRuns = 0;
  const inner = (): LoopPhases<string, string, string> => ({
    perceive: async () => "c",
    plan: async ({ attempt }) => `p${attempt}`,
    execute: async ({ plan }) => plan,
    reflect: async ({ attempt }) => ({ grade: attempt >= 2 ? "A" : "F" }),
  });
  const outer: LoopPhases<string, string, string> = {
    perceive: async () => "c",
    plan: async ({ attempt }) => `step${attempt}`,
    execute: async ({ plan }) => {
      innerRuns++;
      const result = await runLoop(plan, inner(), { maxAttempts: 3 });
      return result.status;
    },
    reflect: async ({ output, attempt }) => ({ grade: output === "passed" && attempt >= 2 ? "S" : "B" }),
  };
  const result = await runLoop("job", outer, { maxAttempts: 3 });
  assertEquals(result.status, "passed");
  assertEquals(result.attempts.length, 2);
  assertEquals(innerRuns, 2);
});
