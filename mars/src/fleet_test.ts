import { assert, assertEquals, assertThrows } from "@std/assert";
import { FleetOrchestrator, type SubAgentExecutor, type SubAgentResult, type SubAgentTask } from "./fleet.ts";

const spec = (ref: string, dependsOn: string[] = [], extra: Partial<SubAgentTask> = {}) => ({
  ref,
  name: ref,
  prompt: ref,
  domain: "backend" as const,
  allowedPaths: [],
  timeoutMs: 1000,
  dependsOn,
  priority: 0,
  ...extra,
});

const ok = (task: SubAgentTask): SubAgentResult => ({
  taskId: task.id,
  status: "success",
  output: task.name,
  filesModified: [],
  durationMs: 0,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.test("dependencies run before their dependents and refs resolve to ids", async () => {
  const order: string[] = [];
  const executor: SubAgentExecutor = async (task) => {
    await sleep(5);
    order.push(task.name);
    return ok(task);
  };
  const plan = FleetOrchestrator.decompose("job", [spec("c", ["b"]), spec("b", ["a"]), spec("a")]);
  const result = await new FleetOrchestrator(executor).execute(plan);
  assertEquals(order, ["a", "b", "c"]);
  assertEquals(result.status, "completed");
});

Deno.test("independent tasks run in parallel but never more than five at once", async () => {
  let running = 0;
  let peak = 0;
  const executor: SubAgentExecutor = async (task) => {
    running++;
    peak = Math.max(peak, running);
    await sleep(20);
    running--;
    return ok(task);
  };
  const plan = FleetOrchestrator.decompose("job", Array.from({ length: 12 }, (_, i) => spec(`t${i}`)));
  const result = await new FleetOrchestrator(executor).execute(plan);
  assertEquals(result.results.length, 12);
  assertEquals(peak, 5);

  // A hand-built plan cannot raise the cap.
  peak = 0;
  const raised = { ...plan, maxConcurrency: 50 };
  await new FleetOrchestrator(executor).execute(raised);
  assertEquals(peak, 5);
});

Deno.test("a failed task cancels its dependents but not its siblings", async () => {
  const executor: SubAgentExecutor = async (task) =>
    task.name === "bad" ? { ...ok(task), status: "failure", error: "nope" } : ok(task);
  const plan = FleetOrchestrator.decompose("job", [
    spec("bad"),
    spec("child", ["bad"]),
    spec("grandchild", ["child"]),
    spec("sibling"),
  ]);
  const result = await new FleetOrchestrator(executor).execute(plan);
  const byName = new Map(result.results.map((r) => [plan.tasks.find((t) => t.id === r.taskId)!.name, r.status]));
  assertEquals(byName.get("bad"), "failure");
  assertEquals(byName.get("child"), "cancelled");
  assertEquals(byName.get("grandchild"), "cancelled");
  assertEquals(byName.get("sibling"), "success");
  assertEquals(result.status, "partial");
});

Deno.test("a timeout aborts the executor's signal and is reported as a timeout", async () => {
  let aborted = false;
  const executor: SubAgentExecutor = (task, signal) =>
    new Promise((resolve) => {
      signal.addEventListener("abort", () => {
        aborted = true;
        resolve(ok(task));
      });
    });
  const plan = FleetOrchestrator.decompose("job", [spec("slow", [], { timeoutMs: 30 })]);
  const result = await new FleetOrchestrator(executor).execute(plan);
  assertEquals(result.results[0].status, "timeout");
  assert(aborted);
});

Deno.test("an executor that throws becomes a failure, not a crash", async () => {
  const executor: SubAgentExecutor = () => {
    throw new Error("boom");
  };
  const plan = FleetOrchestrator.decompose("job", [spec("a")]);
  const result = await new FleetOrchestrator(executor).execute(plan);
  assertEquals(result.results[0].status, "failure");
  assertEquals(result.results[0].error, "boom");
});

Deno.test("bad graphs are rejected up front: unknown ref, duplicate ref, cycle", () => {
  assertThrows(() => FleetOrchestrator.decompose("job", [spec("a", ["missing"])]), Error, "unknown ref");
  assertThrows(() => FleetOrchestrator.decompose("job", [spec("a"), spec("a")]), Error, "Duplicate");
  assertThrows(() => FleetOrchestrator.decompose("job", [spec("a", ["b"]), spec("b", ["a"])]), Error, "Circular");
});
