/**
 * Plan normalization and execution order
 *
 * - Assigns stable ids (step-0, step-1) so we never rely on LLM-generated ids
 * - Sanitizes dependsOnIndices (clamp, drop self, cap)
 * - Infers resources from step descriptions for conflict ordering
 * - Topological sort: explicit dependencies + implicit same-resource ordering
 */

import type { Plan, PlanStep } from "./types";

/** Raw step from planner (no id; LLM may output dependsOnIndices) */
export interface RawPlanStep {
  description: string;
  intent: "modify" | "add" | "remove";
  dependsOnIndices?: number[];
}

/** Raw plan as returned by planner before normalization */
export interface RawPlan {
  steps: RawPlanStep[];
}

/** Max dependencies per step to avoid over-specifying */
const MAX_DEPENDS_ON = 2;

/** Resource keywords for inferring resources from step description (lowercase) */
const RESOURCE_KEYWORDS = [
  "header",
  "sidebar",
  "footer",
  "main",
  "content",
  "form",
  "button",
  "nav",
  "navigation",
  "menu",
  "card",
  "list",
  "input",
  "label",
];

/**
 * Infer resources touched by a step from its description (keyword extraction)
 */
function inferResourcesFromDescription(description: string): string[] {
  const lower = description.toLowerCase();
  const found: string[] = [];
  for (const kw of RESOURCE_KEYWORDS) {
    if (lower.includes(kw)) {
      found.push(kw);
    }
  }
  return found;
}

/**
 * Sanitize dependsOnIndices: drop out-of-range, self, negative; cap at MAX_DEPENDS_ON
 */
function sanitizeDependsOn(indices: number[] | undefined, stepIndex: number, numSteps: number): number[] {
  if (!indices || indices.length === 0) return [];
  const set = new Set<number>();
  for (const i of indices) {
    if (typeof i !== "number" || i < 0 || i >= numSteps || i === stepIndex) continue;
    set.add(i);
  }
  const arr = Array.from(set);
  return arr.slice(0, MAX_DEPENDS_ON);
}

/**
 * Build adjacency list for topological sort.
 * Nodes are step indices 0..n-1.
 * Edge from i to j means i must run before j.
 * Sources: explicit dependsOn + implicit same-resource ordering (earlier index before later)
 */
function buildOrderGraph(steps: PlanStep[]): Map<number, number[]> {
  const n = steps.length;
  const outEdges = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    outEdges.set(i, []);
  }

  // Explicit dependencies: for step j, each i in step.dependsOn => edge i -> j
  for (let j = 0; j < n; j++) {
    const deps = steps[j].dependsOn ?? [];
    for (const i of deps) {
      if (i >= 0 && i < n && i !== j) {
        outEdges.get(i)!.push(j);
      }
    }
  }

  // Implicit same-resource ordering: steps sharing a resource run in index order
  const resourceToIndices = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const resources = steps[i].resources ?? [];
    const inferred = inferResourcesFromDescription(steps[i].description);
    const all = [...new Set([...resources, ...inferred])];
    for (const r of all) {
      if (!resourceToIndices.has(r)) resourceToIndices.set(r, []);
      resourceToIndices.get(r)!.push(i);
    }
  }
  for (const indices of resourceToIndices.values()) {
    indices.sort((a, b) => a - b);
    for (let k = 0; k < indices.length - 1; k++) {
      const from = indices[k];
      const to = indices[k + 1];
      const edges = outEdges.get(from)!;
      if (!edges.includes(to)) {
        edges.push(to);
      }
    }
  }

  return outEdges;
}

/**
 * Topological sort (Kahn's algorithm). Returns step indices in execution order.
 * Throws if cycle detected.
 */
function topologicalSort(steps: PlanStep[]): number[] {
  const n = steps.length;
  const outEdges = buildOrderGraph(steps);
  const inDegree = new Array(n).fill(0);
  for (const edges of outEdges.values()) {
    for (const j of edges) {
      inDegree[j]++;
    }
  }
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) queue.push(i);
  }
  const order: number[] = [];
  while (queue.length > 0) {
    const i = queue.shift()!;
    order.push(i);
    for (const j of outEdges.get(i)!) {
      inDegree[j]--;
      if (inDegree[j] === 0) queue.push(j);
    }
  }
  if (order.length !== n) {
    throw new Error("Plan has a cycle in dependencies or resource ordering; cannot compute execution order");
  }
  return order;
}

/**
 * Order steps by dependencies and resource conflicts.
 * Returns a new array of steps in execution order.
 */
export function orderStepsByDependencies(plan: Plan): PlanStep[] {
  if (plan.steps.length === 0) return [];
  const order = topologicalSort(plan.steps);
  return order.map((i) => plan.steps[i]);
}

/**
 * Normalize a raw plan from the planner into a Plan with stable ids and correct execution order.
 * - Assigns id (step-0, step-1, ...)
 * - Sanitizes dependsOnIndices into dependsOn
 * - Infers resources from descriptions
 * - Reorders steps by topological sort (dependencies + resource ordering)
 */
export function normalizePlan(raw: RawPlan): Plan {
  if (!raw.steps || raw.steps.length === 0) {
    throw new Error("Plan must have at least one step");
  }
  const n = raw.steps.length;
  const steps: PlanStep[] = raw.steps.map((s, i) => ({
    id: `step-${i}`,
    description: s.description,
    intent: s.intent,
    dependsOn: sanitizeDependsOn(s.dependsOnIndices, i, n),
    resources: inferResourcesFromDescription(s.description),
  }));

  const ordered = orderStepsByDependencies({ steps });
  return { steps: ordered };
}
