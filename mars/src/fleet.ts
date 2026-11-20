// SPDX-License-Identifier: MIT (originally from the MARS repository; see mars/LICENSE-MIT)
/**
 * @module fleet
 *
 * A dependency-aware scheduler for fan-out work. Give it tasks with `dependsOn`
 * edges and an executor; it validates the graph (unknown and circular dependencies
 * are errors), runs ready tasks in waves of at most MAX_FAN_OUT, enforces a per-task
 * timeout, and cancels anything whose dependency failed.
 *
 * What it does not do: run anything itself, isolate anything, or judge results.
 * The executor you pass in decides what a task is. To box an agent, run it through
 * the VISA gate and `runSandboxed` inside that executor.
 */

import { log } from "./log.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SubAgentTask {
  /** Unique task ID, assigned by `decompose`. */
  id: string;
  /** A name unique within one `decompose` call. Other tasks list it in `dependsOn`. */
  ref?: string;
  /** Human-readable name */
  name: string;
  /** The prompt/instruction for this sub-agent */
  prompt: string;
  /** Which domain this task targets (frontend, backend, database, infra) */
  domain: "frontend" | "backend" | "database" | "infra" | "docs" | "test";
  /** File paths this agent is allowed to modify (sandboxing) */
  allowedPaths: string[];
  /** Maximum execution time in ms */
  timeoutMs: number;
  /** Refs (before `decompose`) or ids (after) of tasks that must succeed before this one. */
  dependsOn: string[];
  /** Priority (lower = higher priority) */
  priority: number;
}

export interface SubAgentResult {
  /** Task ID that produced this result */
  taskId: string;
  /** Execution status */
  status: "success" | "failure" | "timeout" | "cancelled";
  /** Result output (code diff, test results, etc.) */
  output: string;
  /** Error message if failed */
  error?: string;
  /** Files modified */
  filesModified: string[];
  /** Execution duration in ms */
  durationMs: number;
  /** Victory grade assigned by sub-agent Ouroboros */
  grade?: "S" | "A" | "B" | "F";
}

export interface SwarmPlan {
  /** Unique swarm execution ID */
  swarmId: string;
  /** The original complex task that spawned this swarm */
  originalTask: string;
  /** Decomposed sub-tasks */
  tasks: SubAgentTask[];
  /** Maximum concurrent sub-agents */
  maxConcurrency: number;
  /** Overall timeout for the entire swarm */
  timeoutMs: number;
}

export interface SwarmResult {
  /** Swarm execution ID */
  swarmId: string;
  /** Individual task results */
  results: SubAgentResult[];
  /** Aggregated status */
  status: "completed" | "partial" | "failed";
  /** Merged output from all successful sub-agents */
  mergedOutput: string;
  /** Total duration */
  durationMs: number;
  /** One-line summary, suitable for a journal entry. */
  summary: string;
}

/** Runs one task. Stop work when `signal` aborts; the scheduler aborts it on timeout. */
export type SubAgentExecutor = (task: SubAgentTask, signal: AbortSignal) => Promise<SubAgentResult>;

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_FAN_OUT = 5;
const DEFAULT_TASK_TIMEOUT = 120_000; // 2 minutes
const DEFAULT_SWARM_TIMEOUT = 600_000; // 10 minutes

// ─── Fleet Orchestrator ──────────────────────────────────────────────────────

export class FleetOrchestrator {
  private readonly executor: SubAgentExecutor;

  constructor(executor: SubAgentExecutor) {
    this.executor = executor;
  }

  /**
   * Decompose a complex task into sub-agent tasks.
   * This is the "Archon" intelligence layer — it analyzes the task
   * and creates an optimal execution plan.
   */
  static decompose(
    originalTask: string,
    taskSpecs: Omit<SubAgentTask, "id">[],
  ): SwarmPlan {
    const swarmId = `swarm-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    // Assign IDs and validate
    const idByRef = new Map<string, string>();
    taskSpecs.forEach((spec, i) => {
      if (spec.ref === undefined) return;
      if (idByRef.has(spec.ref)) throw new Error(`Duplicate task ref: ${spec.ref}`);
      idByRef.set(spec.ref, `${swarmId}-task-${i}`);
    });
    const tasks: SubAgentTask[] = taskSpecs.map((spec, i) => ({
      ...spec,
      id: `${swarmId}-task-${i}`,
      dependsOn: spec.dependsOn.map((dep) => {
        const id = idByRef.get(dep);
        if (id === undefined) throw new Error(`Task ${spec.ref ?? i} depends on unknown ref: ${dep}`);
        return id;
      }),
      timeoutMs: spec.timeoutMs || DEFAULT_TASK_TIMEOUT,
      priority: spec.priority ?? i,
    }));

    // Validate dependency graph (no cycles)
    FleetOrchestrator.validateDependencies(tasks);

    return {
      swarmId,
      originalTask,
      tasks,
      maxConcurrency: Math.min(tasks.length, MAX_FAN_OUT),
      timeoutMs: DEFAULT_SWARM_TIMEOUT,
    };
  }

  /**
   * Execute a swarm plan with parallel sub-agent dispatch.
   * Respects dependency ordering and concurrency limits.
   */
  async execute(plan: SwarmPlan): Promise<SwarmResult> {
    const startTime = Date.now();
    const results: SubAgentResult[] = [];
    const completedIds = new Set<string>();
    const failedIds = new Set<string>();

    log("info", "fleet:swarm:start", {
      swarmId: plan.swarmId,
      taskCount: plan.tasks.length,
      maxConcurrency: plan.maxConcurrency,
    });

    // Topological sort by dependencies then priority
    const sortedTasks = FleetOrchestrator.topologicalSort(plan.tasks);

    // Execute in waves respecting dependencies
    while (completedIds.size + failedIds.size < sortedTasks.length) {
      // Find ready tasks (all dependencies satisfied)
      const readyTasks = sortedTasks.filter((task) =>
        !completedIds.has(task.id) &&
        !failedIds.has(task.id) &&
        task.dependsOn.every((depId) => completedIds.has(depId))
      );

      if (readyTasks.length === 0) {
        // Check if we're stuck (unresolvable dependencies)
        const remainingTasks = sortedTasks.filter(
          (t) => !completedIds.has(t.id) && !failedIds.has(t.id),
        );
        if (remainingTasks.length > 0) {
          // Dependencies failed — cancel remaining
          for (const task of remainingTasks) {
            results.push({
              taskId: task.id,
              status: "cancelled",
              output: "",
              error: "Dependency failed or unresolvable",
              filesModified: [],
              durationMs: 0,
            });
            failedIds.add(task.id);
          }
        }
        break;
      }

      // Execute ready tasks in parallel (bounded by maxConcurrency)
      const batch = readyTasks.slice(0, Math.max(1, Math.min(plan.maxConcurrency, MAX_FAN_OUT)));

      log("info", "fleet:wave:dispatch", {
        swarmId: plan.swarmId,
        waveSize: batch.length,
        taskIds: batch.map((t) => t.id),
      });

      const batchResults = await Promise.allSettled(
        batch.map((task) => this.executeWithTimeout(task)),
      );

      for (let i = 0; i < batchResults.length; i++) {
        const settled = batchResults[i];
        const task = batch[i];

        if (settled.status === "fulfilled") {
          results.push(settled.value);
          if (settled.value.status === "success") {
            completedIds.add(task.id);
          } else {
            failedIds.add(task.id);
          }
        } else {
          results.push({
            taskId: task.id,
            status: "failure",
            output: "",
            error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
            filesModified: [],
            durationMs: 0,
          });
          failedIds.add(task.id);
        }
      }

      // Check swarm-level timeout
      if (Date.now() - startTime > plan.timeoutMs) {
        log("warn", "fleet:swarm:timeout", { swarmId: plan.swarmId });
        break;
      }
    }

    const durationMs = Date.now() - startTime;
    const successCount = results.filter((r) => r.status === "success").length;
    const totalCount = results.length;

    const swarmResult: SwarmResult = {
      swarmId: plan.swarmId,
      results,
      status: successCount === totalCount ? "completed" : successCount > 0 ? "partial" : "failed",
      mergedOutput: results
        .filter((r) => r.status === "success")
        .map((r) => r.output)
        .join("\n\n---\n\n"),
      durationMs,
      summary: `Swarm ${plan.swarmId}: ${successCount}/${totalCount} tasks succeeded in ${durationMs}ms`,
    };

    log("info", "fleet:swarm:complete", {
      swarmId: plan.swarmId,
      status: swarmResult.status,
      successCount,
      totalCount,
      durationMs,
    });

    return swarmResult;
  }

  /**
   * Execute a single sub-agent task with timeout enforcement.
   */
  private async executeWithTimeout(task: SubAgentTask): Promise<SubAgentResult> {
    const startTime = Date.now();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        // Settle the timeout first. Aborting first would let an executor that resolves
        // on abort win the race and report a timed-out task as a success.
        reject(new Error("Task timeout"));
        controller.abort();
      }, task.timeoutMs);
    });

    try {
      return await Promise.race([this.executor(task, controller.signal), timeout]);
    } catch (err) {
      return {
        taskId: task.id,
        status: err instanceof Error && err.message === "Task timeout" ? "timeout" : "failure",
        output: "",
        error: err instanceof Error ? err.message : String(err),
        filesModified: [],
        durationMs: Date.now() - startTime,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Validate that the dependency graph has no cycles.
   */
  static validateDependencies(tasks: SubAgentTask[]): void {
    const taskIds = new Set(tasks.map((t) => t.id));
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    function dfs(taskId: string): void {
      if (inStack.has(taskId)) {
        throw new Error(`Circular dependency detected involving task: ${taskId}`);
      }
      if (visited.has(taskId)) return;

      inStack.add(taskId);
      const task = taskMap.get(taskId);
      if (task) {
        for (const depId of task.dependsOn) {
          if (!taskIds.has(depId)) {
            throw new Error(`Task ${taskId} depends on unknown task: ${depId}`);
          }
          dfs(depId);
        }
      }
      inStack.delete(taskId);
      visited.add(taskId);
    }

    for (const task of tasks) {
      dfs(task.id);
    }
  }

  /**
   * Topological sort of tasks by dependencies, then by priority.
   */
  static topologicalSort(tasks: SubAgentTask[]): SubAgentTask[] {
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const task of tasks) {
      inDegree.set(task.id, task.dependsOn.length);
      for (const depId of task.dependsOn) {
        const deps = adjacency.get(depId) ?? [];
        deps.push(task.id);
        adjacency.set(depId, deps);
      }
    }

    // Start with tasks that have no dependencies
    const queue = tasks
      .filter((t) => t.dependsOn.length === 0)
      .sort((a, b) => a.priority - b.priority);

    const sorted: SubAgentTask[] = [];

    while (queue.length > 0) {
      const task = queue.shift()!;
      sorted.push(task);

      const dependents = adjacency.get(task.id) ?? [];
      for (const depId of dependents) {
        const currentDegree = (inDegree.get(depId) ?? 1) - 1;
        inDegree.set(depId, currentDegree);
        if (currentDegree === 0) {
          const depTask = taskMap.get(depId);
          if (depTask) queue.push(depTask);
        }
      }

      // Re-sort queue by priority
      queue.sort((a, b) => a.priority - b.priority);
    }

    return sorted;
  }
}
