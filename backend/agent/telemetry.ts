/**
 * Execution telemetry: timing and counts for planner, executor, retries, replans.
 * Logs a one-line summary at the end of plan execution for tuning and comparison.
 */

export interface ExecutorTelemetry {
  plannerMs: number;
  executorStepMs: number[];
  totalMs: number;
  steps: number;
  retries: number;
  replans: number;
}

const noopTelemetry: ExecutorTelemetry = {
  plannerMs: 0,
  executorStepMs: [],
  totalMs: 0,
  steps: 0,
  retries: 0,
  replans: 0,
};

let currentTelemetry: ExecutorTelemetry = { ...noopTelemetry };

export function getExecutorTelemetry(): ExecutorTelemetry {
  return { ...currentTelemetry };
}

export function resetExecutorTelemetry(): void {
  currentTelemetry = { ...noopTelemetry };
}

export function setPlannerMs(ms: number): void {
  currentTelemetry.plannerMs = ms;
}

export function addExecutorStepMs(ms: number): void {
  currentTelemetry.executorStepMs.push(ms);
}

export function setTotalMs(ms: number): void {
  currentTelemetry.totalMs = ms;
}

export function setStepsCount(n: number): void {
  currentTelemetry.steps = n;
}

export function setRetriesCount(n: number): void {
  currentTelemetry.retries = n;
}

export function setReplansCount(n: number): void {
  currentTelemetry.replans = n;
}

export function logPerf(label: string, ms: number): void {
  console.log(`[PERF] ${label}: ${Math.round(ms)}ms`);
}

export function logExecutorSummary(t: ExecutorTelemetry): void {
  const executorTotal = t.executorStepMs.reduce((a, b) => a + b, 0);
  console.log(
    `[PERF] Summary: planner=${Math.round(t.plannerMs)}ms executorTotal=${Math.round(executorTotal)}ms steps=${t.steps} retries=${t.retries} replans=${t.replans} total=${Math.round(t.totalMs)}ms`
  );
}
