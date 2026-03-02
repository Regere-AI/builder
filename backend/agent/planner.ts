/**
 * Planner Logic
 *
 * Breaks high-level goals into ordered, executable steps.
 * Uses a lightweight prompt only (no schema, no registry, no full UI JSON).
 * Heavy context lives in the executor.
 */

import { z } from "zod";
import { generateText } from "ai";
import { getPlannerModel } from "../llm/models";
import type { LayoutNode } from "../../shared/schema";
import type { RawPlan, RawPlanStep } from "./plan-order";
import {
  getPlannerSystemPrompt,
  buildPlannerPrompt as buildPlannerUserPrompt,
} from "../prompts/plannerPrompt";
import { makePlannerCacheKey, getCachedPlan, setCachedPlan } from "./planner-cache";
import { setPlannerMs, logPerf } from "./telemetry";

/** Max raw response length before refusing to parse (prevents token spikes and verbose hallucinations) */
const MAX_PLANNER_RESPONSE_CHARS = 4_000;

/**
 * Extract parseable JSON from planner response (may be wrapped in markdown or truncated).
 * - Strips ```json ... ``` if present.
 * - Finds first complete { ... } by brace-matching.
 * - If truncated, tries to close with ]} or } so parse can succeed.
 */
function extractPlannerJSON(raw: string): string {
  let s = raw.trim();
  if (!s) throw new Error("Planner returned empty response. Try again or rephrase your request.");
  const codeBlock = s.match(/^```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) s = codeBlock[1].trim();
  const firstBrace = s.indexOf("{");
  if (firstBrace === -1) throw new Error("Planner returned no JSON object. Reply must be valid JSON with a \"steps\" array.");

  let depth = 0;
  let inString = false;
  let escape = false;
  let quote = "";
  for (let i = firstBrace; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(firstBrace, i + 1);
    } else if (c === "[" || c === "]") {
      // track brackets so we can fix truncated arrays
    }
  }

  const truncated = s.slice(firstBrace);
  if (depth > 0) {
    let fix = truncated;
    const openCurly = (fix.match(/\{/g) || []).length;
    const closeCurly = (fix.match(/\}/g) || []).length;
    const openSquare = (fix.match(/\[/g) || []).length;
    const closeSquare = (fix.match(/\]/g) || []).length;
    const needSquare = Math.max(0, openSquare - closeSquare);
    const needCurly = Math.max(0, openCurly - closeCurly);
    for (let i = 0; i < needSquare; i++) fix += "]";
    for (let i = 0; i < needCurly; i++) fix += "}";
    return fix;
  }
  return truncated;
}

/** Allowed intent values from planner (natural language); normalized to modify/add/remove for execution */
const PLANNER_INTENT_ENUM = ["modify", "add", "remove", "create", "insert"] as const;

/**
 * Normalize planner intent to executor intent. "create" and "insert" both mean adding components.
 */
function normalizePlannerIntent(
  intent: (typeof PLANNER_INTENT_ENUM)[number]
): "modify" | "add" | "remove" {
  if (intent === "create" || intent === "insert") return "add";
  return intent;
}

/**
 * Zod schema for planner response (raw; no id from LLM).
 * .strict() rejects nested "steps", "id", "type", or any other extra keys.
 * intent can be create/insert (normalized to add) so user phrases like "Create X" / "Insert Y" validate.
 */
const PlanStepSchema = z
  .object({
    description: z.string().min(1, "Step description must be non-empty"),
    intent: z.enum(PLANNER_INTENT_ENUM),
    dependsOnIndices: z.array(z.number().int().min(0)).optional(),
  })
  .strict();

const PlanSchema = z
  .object({
    steps: z.array(PlanStepSchema).min(1, "Plan must have at least one step"),
  })
  .strict();

type PlanParsed = z.infer<typeof PlanSchema>;

/**
 * Derive a one-line summary of current UI for the planner (optional, token-light).
 */
function summarizeUI(node: LayoutNode): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  const type = node.type;
  const children = node.children;
  if (type === "component" && node.props?.component) {
    return `Component: ${node.props.component}`;
  }
  if (Array.isArray(children)) {
    const n = children.length;
    if (type === "flex" && n > 0) return `Layout with ${n} top-level sections`;
    if (type === "grid" && n > 0) return `Grid with ${n} items`;
  }
  return undefined;
}

/**
 * Generate a raw plan from a goal (no ids; caller must run normalizePlan).
 * Uses lightweight prompt only: goal + uiExists + optional one-line summary. No full UI JSON.
 * When currentUI is null (no existing UI), plan is generated for "create" flow so plan steps can be shown immediately.
 */
export async function generatePlan(
  goal: string,
  currentUI: LayoutNode | null
): Promise<RawPlan> {
  const uiExists = !!currentUI && !!currentUI.type;
  const optionalSummary = uiExists && currentUI ? summarizeUI(currentUI) : undefined;
  const cacheKey = makePlannerCacheKey(goal, optionalSummary ?? undefined);

  const cached = getCachedPlan(cacheKey);
  if (cached) {
    console.log("[PLANNER] Cache hit, reusing plan");
    setPlannerMs(0);
    return cached;
  }

  console.log("[PLANNER] Cache miss, calling LLM");
  const plannerUserPrompt = buildPlannerUserPrompt(goal, uiExists, optionalSummary);

  const emptyOrParseErrorHint =
    " Planner model returned no text or invalid JSON. Check PLANNER_MODEL and OPENAI_API_KEY in .env.";

  let rawResponse: string;
  let lastParseError: Error | null = null;
  const maxAttempts = 2;
  let parsed: unknown = undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const plannerStart = performance.now();
    const result = await generateText({
      model: getPlannerModel(),
      prompt: plannerUserPrompt,
      system: getPlannerSystemPrompt(),
      temperature: 0.2,
    });
    rawResponse = result.text ?? "";
    const plannerMs = performance.now() - plannerStart;
    setPlannerMs(plannerMs);
    logPerf("planner.llm", plannerMs);

    if (rawResponse.length > MAX_PLANNER_RESPONSE_CHARS) {
      console.warn(
        `[PLANNER] Response too large (${rawResponse.length} chars); refusing to parse. Max: ${MAX_PLANNER_RESPONSE_CHARS}`
      );
      throw new Error("Planner response too large; refusing to parse");
    }

    if (!rawResponse.trim()) {
      console.warn(`[PLANNER] Attempt ${attempt}/${maxAttempts}: empty response (${rawResponse.length} chars)`);
      lastParseError = new Error("Planner returned empty response. Try again or rephrase your request.");
      if (attempt < maxAttempts) continue;
      throw new Error("Planner returned empty response. Try again or rephrase your request." + emptyOrParseErrorHint);
    }

    try {
      const extracted = extractPlannerJSON(rawResponse);
      parsed = JSON.parse(extracted);
      break;
    } catch (parseError) {
      lastParseError = parseError instanceof Error ? parseError : new Error(String(parseError));
      console.warn(
        `[PLANNER] Attempt ${attempt}/${maxAttempts}: parse failed: ${lastParseError.message} (response length: ${rawResponse.length})`
      );
      if (attempt < maxAttempts) continue;
      throw new Error(
        `Failed to parse planner response as JSON: ${lastParseError.message}${emptyOrParseErrorHint}`
      );
    }
  }

  if (parsed === undefined) {
    throw lastParseError ?? new Error("Failed to parse planner response as JSON." + emptyOrParseErrorHint);
  }

  // Coerce empty steps from LLM to a single step so we never throw "Plan must have at least one step"
  if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { steps?: unknown[] }).steps) &&
    (parsed as { steps: unknown[] }).steps.length === 0
  ) {
    (parsed as { steps: Array<{ description: string; intent: string }> }).steps = [
      { description: goal.trim() || "Add requested UI", intent: "add" },
    ];
  }

  const validationResult = PlanSchema.safeParse(parsed);
  if (!validationResult.success) {
    const errors = validationResult.error.errors.map(
      (e) => `${e.path.join(".")}: ${e.message}`
    );
    throw new Error(`Invalid plan structure: ${errors.join(", ")}`);
  }

  const data = validationResult.data;

  /** Normalize step description for duplicate detection: lowercase, trim, collapse spaces */
  function normalizeStepDescription(desc: string): string {
    return desc.replace(/\s+/g, " ").trim().toLowerCase();
  }

  /** Remove duplicate or near-duplicate steps (same logical action) so we don't create double components */
  function deduplicatePlanSteps(
    steps: Array<{ description?: string; intent?: string; dependsOnIndices?: number[] }>
  ): Array<{ description?: string; intent?: string; dependsOnIndices?: number[] }> {
    if (steps.length <= 1) return steps;
    const seen = new Set<string>();
    const result: typeof steps = [];
    for (const s of steps) {
      const norm = normalizeStepDescription(s.description);
      if (norm.length === 0) continue;
      // Skip if we already have a step with the same normalized description
      if (seen.has(norm)) {
        console.log("[PLANNER] Dropping duplicate step:", s.description.slice(0, 60));
        continue;
      }
      // Skip if this description is a substring of an already-seen one (redundant)
      let isRedundant = false;
      for (const seenNorm of seen) {
        if (seenNorm.includes(norm) && norm.length < seenNorm.length) {
          isRedundant = true;
          break;
        }
      }
      if (isRedundant) {
        console.log("[PLANNER] Dropping redundant step (subsumed by earlier):", s.description.slice(0, 60));
        continue;
      }
      seen.add(norm);
      result.push(s);
    }
    return result.length >= 1 ? result : [steps[0]];
  }

  const dedupedSteps = deduplicatePlanSteps(data.steps);
  const steps: RawPlanStep[] = dedupedSteps.map((s) => ({
    description: s.description ?? "",
    intent: normalizePlannerIntent((s.intent ?? "modify") as (typeof PLANNER_INTENT_ENUM)[number]),
    dependsOnIndices: s.dependsOnIndices,
  }));

  const rawPlan: RawPlan = { steps };
  setCachedPlan(cacheKey, rawPlan);
  return rawPlan;
}
