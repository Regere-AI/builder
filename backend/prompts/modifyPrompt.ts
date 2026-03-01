/**
 * Modify UI Prompt Template
 * 
 * This module provides the user prompt template for modifying existing UI layouts.
 * This prompt is sent as the user message alongside the system prompt.
 * 
 * Unlike the create prompt, this prompt includes the existing UI as context
 * and instructs the model to regenerate the entire UI with the requested changes.
 * 
 * The existing UI is injected from application state (single source of truth).
 */

import type { LayoutNode } from "../../shared/schema";
import { formatRulesForPrompt } from "../design-rules";

/**
 * Builds a user prompt for modifying an existing UI layout.
 * 
 * Injects current UI state into the prompt.
 * 
 * The model must regenerate the FULL UI JSON while applying the requested changes.
 * The existing UI is provided as context from application state - the output must be a complete
 * new LayoutNode that replaces the existing one.
 * 
 * @param existingUI - The current UI layout from state (single source of truth)
 * @param userPrompt - The natural language description of the changes to apply
 * @returns The formatted user prompt string with injected UI state
 */
export function buildModifyUIPrompt(
  existingUI: LayoutNode,
  userPrompt: string
): string {
  // Serialize current UI state to clean JSON
  // Convert currentUiJson to clean JSON (no functions, no comments, no formatting tricks)
  const existingUIJson = JSON.stringify(existingUI, null, 2);
  const designRules = formatRulesForPrompt(["spacing", "accessibility", "consistency"]);

  return `MODIFY an existing UI layout.

CRITICAL: You are modifying an EXISTING UI. The current UI state is provided below.
Your task is to apply ONLY the requested changes while preserving everything else.

${designRules}

IMPORTANT RULES:
- You MUST regenerate the entire UI JSON from scratch
- Do NOT output partial updates, diffs, or patches
- Do NOT reference the old UI structure in your output
- The output must be a complete, valid LayoutNode that replaces the existing UI
- Apply ONLY the requested changes - keep all unaffected parts EXACTLY the same
- Prefer minimal, localized changes - do not restructure unless requested
- Always output the full UI structure (complete LayoutNode)
- The output should represent a complete, renderable UI
- Use ONLY components and layouts that exist in the current UI or are explicitly requested
- Do NOT invent new components that weren't in the original UI
- Follow the design rules above to ensure proper spacing, accessibility, and consistency

Existing UI JSON (Current State):
${existingUIJson}

User modification request:
"${userPrompt}"

Apply the requested changes to the existing UI above.
Keep all parts that are not mentioned in the modification request unchanged.
Output ONLY the complete layout JSON - no wrapper fields, no intent, no explanation.`;
}
