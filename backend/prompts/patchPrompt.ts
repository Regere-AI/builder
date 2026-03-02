/**
 * Patch-Based Modify Prompt Template
 * 
 * This module provides the user prompt template for patch-based UI modifications.
 * Instead of regenerating the entire UI, this prompt instructs the model to output
 * JSON Patch operations (RFC 6902) that can be applied surgically to the existing UI.
 * 
 * This enables precision editing - only the requested changes are applied,
 * preserving all other parts of the UI exactly as they were.
 */

import type { LayoutNode } from "../../shared/schema";
import { getPatchRulesGuidance } from "../design-rules";
import { getFirstFlexRowChildrenPath, getDashboardLayoutPaths, getAddressablePathsForPrompt } from "../agent/layout-utils";
import { getAddressableTargets } from "../agent/path-resolver";
import { buildFullModifiablePropsGuidance, formatNonModifiableMessage } from "../../shared/component-render-defaults";
import { COMPONENT_NAMES_FOR_PROMPT, getDataCapabilityPromptGuidance } from "../../shared/component-prompt-mapping";

export interface PatchPromptOptions {
  /** When executing a plan step, focus only on this step and include all details */
  isPlanStep?: boolean;
  /** Intent hint for add/remove (use "add" or "remove" for full component add/remove) */
  stepIntent?: "modify" | "add" | "remove";
  /** When set, the prompt includes this error and asks for corrected patches (retry after apply failure) */
  previousPatchError?: string;
}

/**
 * Builds a user prompt for patch-based UI modification.
 * 
 * Instructs the model to output JSON Patch operations instead of a full UI.
 * The patches will be applied to the existing UI to make only the requested changes.
 * 
 * @param existingUI - The current UI layout from state
 * @param userPrompt - The natural language description of the changes to apply
 * @param options - Optional: isPlanStep (focus only on this step), stepIntent (add/remove hint)
 * @returns The formatted user prompt string with injected UI state
 */
export function buildPatchModifyPrompt(
  existingUI: LayoutNode,
  userPrompt: string,
  options?: PatchPromptOptions
): string {
  const existingUIJson = JSON.stringify(existingUI, null, 2);
  const addressableTargets = getAddressableTargets(existingUI);
  const addressablePaths = getAddressablePathsForPrompt(existingUI);
  const addressableTargetsBlock =
    addressableTargets.length > 0
      ? `\nADDRESSABLE TARGETS — For add/remove use "target" with one of these ids (NEVER use "path" with array indices like /children/1):\n${addressableTargets.map((t) => `- ${t.id} (${t.componentType}${t.acceptsChildren ? ", container" : ""})`).join("\n")}\n`
      : "";
  const addressablePathsBlock =
    addressablePaths.length > 0
      ? `\nADDRESSABLE PATHS — For replace only (changing props/style): you may use paths from this list. For add/remove use TARGETS above, not paths.\n${addressablePaths.map((p) => `- ${p}`).join("\n")}\n`
      : "";
  const rulesGuidance = getPatchRulesGuidance();
  const modifiablePropsGuidance = buildFullModifiablePropsGuidance();
  const intent = options?.stepIntent ?? "modify";
  const nonModifiableExample = formatNonModifiableMessage("someProp", "Accordion", []);
  const flexRowPath = options?.isPlanStep ? getFirstFlexRowChildrenPath(existingUI) : null;
  const dashboardPaths = options?.isPlanStep ? getDashboardLayoutPaths(existingUI) : { sidebarPath: null, mainPath: null };
  const planStepFocus =
    options?.isPlanStep === true
      ? `
STEP FOCUS: Implement ONLY this single step — nothing more. Complete the entire step in one response.
- You may return MULTIPLE patch operations in one response to fully complete this step.
- When the step says "Add all N" and each item has its own details (e.g. plan cards with price + a button), output exactly N separate "add" patches—one per item—each with a full "value" LayoutNode that includes the exact labels/prices/buttons from the step.
- Apply all changes required to complete the step (e.g. multiple "add" patches for multiple cards, or multiple components). A step may create or update several components; do not limit yourself to one component per step.
- If the step says "Create a container/row/flex for N items" or "Create empty...": add ONLY the layout (container and/or flex with empty children). Do NOT add N placeholder components (e.g. cards labeled "Plan 1", "Plan 2", "Plan 3") in this step — a later step will add the real items with their labels. Empty structure means no placeholder cards.
- Do NOT output a full UI layout. Do NOT add components for other steps.
- EXACT LABELS AND HEURISTICS: Copy every label, name, and value from the step into your patch. If the step says "Basic", "Pro", "Enterprise", "$9", "$29", "$99", "Subscribe", use those exact strings. No generic placeholders.
- DO NOT ADD BUTTONS UNLESS ASKED: Only add a Button component when the step explicitly requests a button (e.g. "Add X button", "with Refresh button", "Subscribe button"). When the step says "each with Subscribe button", add a Subscribe button in each card.
- N SIMPLE ITEMS (title/label only): When the step says "Add 4 cards: Card A, Card B, Card C, Card D" or "Add 3 buttons: Save, Cancel, Reset" and each item is just a label/title, output ONE patch with "count" + "component" + "values". Do NOT output N separate add patches for this simple case.`
      : "";

  return `You are asked to update an existing UI layout using JSON Patch operations (RFC 6902).
The intent of this request is "${intent}".${planStepFocus}

CRITICAL: You MUST output PATCHES, NOT a full UI layout. The same JSON is used for both the JSON view and the UI preview — every patch you output will update the layout and reflect in both.

COMPONENTS IN REGISTRY (use only these exact names when adding or replacing components; they render in UI): ${COMPONENT_NAMES_FOR_PROMPT.join(", ")}

MODIFICATION CONTRACT: Modify only what the step asks for. Do not restructure unrelated nodes. Do not add wrappers or containers unless explicitly requested. All changes must satisfy the component registry schema (e.g. components that must not have children must not get children).

OPERATIONS (all via patches; output multiple patches when the request needs multiple changes):
1. Replace: use "replace" with "path" (JSON Pointer to existing node/prop) or "target" + "subpath". Paths must exist in Existing UI or ADDRESSABLE PATHS.
2. Add: use "add" with "target" (id from ADDRESSABLE TARGETS), "position": "append". Single item: "value" (full LayoutNode). N same-type items with distinct labels: use ONE patch with "component", "count": N, "values": ["Label1", "Label2", ...] — runtime expands to N nodes. Do not emit N separate add patches to the same target.
3. Remove: use "remove" with "target" (id from ADDRESSABLE TARGETS). Never use "path" with array indices for add/remove.

OUTPUT FORMAT (choose one):

1. IF THE REQUEST CAN BE FULFILLED:
{
  "patches": [
    {"op": "replace", "path": "/children/0/children", "value": "New Text"}
  ],
  "explanation": "Brief description of changes"
}

2. IF THE REQUEST CANNOT BE FULFILLED (element doesn't exist, or property not modifiable):
{
  "unfulfillable": true,
  "reason": "Clear explanation (e.g., 'No button with label Save found')"
}

3. IF THE REQUEST CANNOT BE FULFILLED (e.g. no matching element exists, invalid structure), respond with unfulfillable. If the user asks to change a property that is NOT in the PREFERRED list below and the component has no modifiable props listed, you MAY still fulfill by using add/replace on that path (e.g. props.style, props.componentProps.X, or any key the user names). Only use unfulfillable for that case when the property truly cannot be applied (e.g. would break the renderer). When you do use unfulfillable for a non-modifiable property, use this EXACT format (replace {property}, {component}, {list}):
"The property \"{property}\" cannot be modified through prompt. Modifiable properties for {component} are: {list}."
Example: "${nonModifiableExample}"

CRITICAL RULES:
- DO NOT output a full LayoutNode structure with "type", "props", "children"
- DO NOT output {"type": "flex", ...} or {"type": "component", ...}
- ONLY output {"patches": [...], "explanation": "..."} OR {"unfulfillable": true, "reason": "..."}
- Each patch must have "op" and either "path" (for replace only) or "target" (for add/remove; preferred).
- Valid operations: "replace", "add", "remove"
- For "add": use {"op": "add", "target": "<id from ADDRESSABLE TARGETS>", "position": "append", "value": <LayoutNode>}. Do NOT use "path": "/children/1" or any path with array indices — use "target" so the runtime resolves the correct path. For "remove": use {"op": "remove", "target": "<id>"}.
- For "replace" you may use "path" (JSON Pointer) or "target" + "subpath" (e.g. subpath: "props/style").

PROPS RULES:
- Every "component" node must have props.component. When replacing a node's full props object, the new value must include "component" and, for Button, minWidth: 44, minHeight: 44, aria-label.
- To change or add a property (e.g. style, color): use "replace" or "add" on the path to that property (e.g. .../props/style, .../props/componentProps/variant). Use paths that exist in Existing UI or from ADDRESSABLE PATHS.

PREFERRED / MODIFIABLE PROPS — Components and their commonly supported properties are listed below. Prefer these when the user asks for changes. You MAY also change any other property the user requests (e.g. props.style, props.componentProps.anyKey, props.anyKey) by using "add" or "replace" on the correct path; only respond unfulfillable if the property cannot be applied (e.g. would break the schema). Always keep props.component when replacing a component's entire props object.
${modifiablePropsGuidance}
For custom styling use props.style; for component-specific data use props.componentProps.KEY. Always keep props.component when replacing any component's props.

TARGET VS PATH:
- Add/remove: always use "target" with an id from ADDRESSABLE TARGETS. Do not use "path" with array indices.
- Replace: use "path" (must exist in Existing UI) or "target" + "subpath". Component props: .../props or .../props/componentProps/KEY. Do not invent paths or indices.
${flexRowPath ? `\nSuggested path to append to the first row: "${flexRowPath}"\n` : ""}
${(dashboardPaths.sidebarPath || dashboardPaths.mainPath) ? `\nSuggested paths: sidebar "${dashboardPaths.sidebarPath || "/children/0/children/-"}", main "${dashboardPaths.mainPath || "/children/1/children/-"}".\n` : ""}

ADD RULES:
- New component in "add" value: always type "component", props.component = registry name (e.g. "Button", "Card"). Button: include minWidth 44, minHeight 44, aria-label; children = label text. Never type "button" or props.label.
- New container (sidebar, row, column): add value = flex node, e.g. type "flex", props direction "column"/"row", gap 8 or 16, children [].
- N items with labels (e.g. "4 cards: A,B,C,D", "3 buttons: Save, Cancel, Reset"): one patch with "component", "count": N, "values": ["A","B","C","D"]. Do not emit N separate add patches to the same target.
- Plan cards / complex cards: add each card as a full LayoutNode (Card with Label children and Button if step says "each with Subscribe button"). Match exact labels and counts from the step.
- Card title: Card with Label child (children = title). Do not use box/container or props.title. Add Button inside Card only when the step asks for it.
- Avatar: children must be array with AvatarFallback (children = initials). Never string children.

DATA: ${getDataCapabilityPromptGuidance()} For pie chart / distribution / slices: add component with componentProps.data array (e.g. [{ name, value }, ...]). BarChart also needs componentProps.bars.

${rulesGuidance}
${addressableTargetsBlock}
${addressablePathsBlock}
${options?.previousPatchError ? `
PREVIOUS PATCH ATTEMPT FAILED (output corrected patches):
${options.previousPatchError}
Use ONLY paths that exist in the "Existing UI JSON" below or from the ADDRESSABLE PATHS list above.
` : ""}

Existing UI JSON (Current State):
${existingUIJson}

User modification request:
"${userPrompt}"

REMEMBER: Output ONLY patches in the format {"patches": [...], "explanation": "..."} or {"unfulfillable": true, "reason": "..."}.
DO NOT output a full UI layout. DO NOT output {"type": "flex", ...} or {"type": "component", ...}.
${options?.isPlanStep === true ? "This is a single plan step: output all patches needed to complete THIS step (multiple adds are allowed). Full UI responses are rejected." : ""}
Output must be valid JSON only, no markdown, no commentary.`;
}
