/**
 * Design Rules Prompt Helper
 * 
 * Utilities to format design rules for inclusion in prompts.
 * This allows the LLM to be aware of design rules during generation.
 */

import { allDesignRules } from "./evaluator";
import type { DesignRule } from "./types";

/**
 * Format a single rule for prompt inclusion
 */
function formatRuleForPrompt(rule: DesignRule): string {
  return `- ${rule.name} (${rule.category}, ${rule.severity}): ${rule.description}`;
}

/**
 * Format all rules by category for prompt inclusion
 */
export function formatRulesForPrompt(categories?: ("spacing" | "accessibility" | "consistency")[]): string {
  const rulesToInclude = categories
    ? allDesignRules.filter(rule => categories.includes(rule.category))
    : allDesignRules;
  
  if (rulesToInclude.length === 0) {
    return "";
  }
  
  const byCategory = {
    spacing: rulesToInclude.filter(r => r.category === "spacing"),
    accessibility: rulesToInclude.filter(r => r.category === "accessibility"),
    consistency: rulesToInclude.filter(r => r.category === "consistency"),
  };
  
  let output = "## Design Rules\n\n";
  output += "Follow these design rules when generating UI layouts. These rules encode UI/UX best practices:\n\n";
  
  if (byCategory.spacing.length > 0) {
    output += "### Spacing Rules\n";
    byCategory.spacing.forEach(rule => {
      output += formatRuleForPrompt(rule) + "\n";
    });
    output += "\n";
  }
  
  if (byCategory.accessibility.length > 0) {
    output += "### Accessibility Rules\n";
    byCategory.accessibility.forEach(rule => {
      output += formatRuleForPrompt(rule) + "\n";
    });
    output += "\n";
  }
  
  if (byCategory.consistency.length > 0) {
    output += "### Consistency Rules\n";
    byCategory.consistency.forEach(rule => {
      output += formatRuleForPrompt(rule) + "\n";
    });
    output += "\n";
  }
  
  output += "Note: These rules are advisory. Follow them unless the user's request explicitly requires otherwise.\n";
  
  return output;
}

/**
 * Get a concise summary of rules for prompt inclusion
 */
export function getRulesSummary(): string {
  const spacingCount = allDesignRules.filter(r => r.category === "spacing").length;
  const accessibilityCount = allDesignRules.filter(r => r.category === "accessibility").length;
  const consistencyCount = allDesignRules.filter(r => r.category === "consistency").length;
  
  return `Follow ${spacingCount} spacing rules, ${accessibilityCount} accessibility rules, and ${consistencyCount} consistency rules. These rules ensure proper spacing, accessibility compliance, and visual consistency.`;
}

/**
 * Get rules guidance for patch-based modifications
 */
export function getPatchRulesGuidance(): string {
  return `When generating patches, ensure the modified UI follows design rules:
- Spacing: Maintain minimum gaps in stacks and form containers
- Accessibility: Ensure interactive elements have proper labels and minimum sizes
- Consistency: Use consistent variants, spacing scales, and typography styles

If a patch would violate a design rule, prefer a patch that maintains rule compliance.`;
}
