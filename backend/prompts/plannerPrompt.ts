/**
 * Lightweight planner prompt — no schema, no registry, no full UI JSON.
 * General rules only; heavy context stays in the executor.
 */

import { getAvailableComponentNames } from "../../shared/componentNames";

const PLANNER_SYSTEM = `You are a UI planning agent. Output only valid JSON. Do not generate UI or schema.

GENERAL RULES:
1. Output format: a single JSON object with a "steps" array. Each step has "description" (string), "intent" (one of: modify, add, remove, create, insert), and optionally "dependsOnIndices" (array of 0-based step indices, at most 2).
2. Step descriptions must be concrete: include exact numbers, names, labels, and values from the user. Never use vague terms like "some", "several", "appropriate", or "etc."
3. Intent: Use "modify" when the user wants to change something existing (e.g. color, text, style). Use "add", "create", or "insert" when adding new components; "remove" when removing. create/insert/add all mean adding to the UI.
4. When the user asks to create or add UI from scratch: first step creates the container (flex row/column or grid); subsequent steps add components. One step may add multiple components of the SAME type (e.g. 3 buttons, 5 tags) or a common pattern (e.g. Label+Input). Do not mix different component types in one step (e.g. not Button+Input+Checkbox in one step).
5. When the user asks to change existing UI (modify): output one or more steps with intent "modify", each with a clear description of what to change (e.g. "Change PieChart segment B to red", "Change title label to Welcome").
6. Do not generate UI JSON, schema, or component trees. Only output the plan as JSON.

ANTI-DUPLICATION (critical):
7. Do NOT repeat the same step or the same component. Each logical action must appear exactly once. For example: if you need one "Add a BarChart to the dashboard", output one step only—never two steps that both add the same BarChart or the same component to the same place.
8. Do NOT add multiple steps that describe the same add/create action (e.g. two steps both "Add a Button" to the same area). Combine into a single step (e.g. "Add 2 Buttons to the header") or keep one step per distinct component/action.
9. Count required components from the user's request and output exactly that many add-steps (one step per distinct component or group), never more.`;

/**
 * Minimal system prompt for the planner (no schema, no registry).
 */
export function getPlannerSystemPrompt(): string {
  return PLANNER_SYSTEM;
}

/**
 * Builds the planner user prompt: only goal + whether UI exists + optional one-line summary.
 */
export function buildPlannerPrompt(
  goal: string,
  uiExists: boolean,
  optionalSummary?: string
): string {
  const uiLine = `Current UI exists: ${uiExists}`;
  const summaryLine =
    optionalSummary && optionalSummary.trim()
      ? `\nCurrent UI summary: ${optionalSummary.trim()}`
      : "";
  const availableComponents = getAvailableComponentNames().join(", ");
  const availableLine = `AVAILABLE COMPONENT TYPES (use only these in step descriptions): ${availableComponents}`;

  return `Given:
- User intent
- Whether a UI already exists (yes/no)
- ${availableLine}

Output ONLY JSON with this structure (no markdown, no explanations):
{
  "steps": [
    { "description": "concrete step with exact details", "intent": "modify" | "add" | "remove" | "create" | "insert" },
    { "description": "...", "intent": "...", "dependsOnIndices": [0] }
  ]
}

Planner input:

User intent:
"${goal}"

${uiLine}${summaryLine}

Create a plan (JSON only). Remember: each component or change once—no duplicate steps.`;
}
