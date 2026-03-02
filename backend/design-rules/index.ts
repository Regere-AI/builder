/**
 * Design Rules Module
 * 
 * Exports all design rules, types, and evaluation functions.
 * 
 * Design rules are declarative constraints that guide UI generation and patching.
 * They encode UI/UX best practices and make the agent "designer-like" - not just
 * correct, but tasteful.
 * 
 * Usage:
 * - Import rules in prompts to guide generation
 * - Reference rules in planners to prefer solutions that violate fewer rules
 * - Use evaluation functions during validation to check rule compliance
 */

// Types
export type {
  RuleSeverity,
  RuleViolation,
  RuleEvaluationResult,
  DesignRule,
  RuleEvaluationContext,
  DesignRulesEvaluation,
} from "./types";

// Rules by category
export {
  spacingRules,
  verticalStackSpacingRule,
  horizontalStackSpacingRule,
  formInputSpacingRule,
  headingTopMarginRule,
} from "./spacing";

export {
  accessibilityRules,
  interactiveElementSizeRule,
  accessibleLabelRule,
  textContrastRule,
} from "./accessibility";

export {
  consistencyRules,
  componentVariantConsistencyRule,
  spacingScaleConsistencyRule,
  typographyConsistencyRule,
} from "./consistency";

// Evaluation functions
export {
  allDesignRules,
  evaluateRule,
  evaluateAllRulesForNode,
  evaluateAllRules,
  getAllViolations,
  getViolationsBySeverity,
  getViolationsByCategory,
  formatViolations,
} from "./evaluator";

// Prompt helpers
export {
  formatRulesForPrompt,
  getRulesSummary,
  getPatchRulesGuidance,
} from "./prompt-helper";
