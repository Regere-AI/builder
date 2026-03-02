/**
 * Design Rules Types
 * 
 * Type definitions for design rules system.
 * Design rules are declarative constraints that guide UI generation and patching.
 */

import type { LayoutNode } from "../../shared/schema";

/**
 * Severity level for rule violations
 */
export type RuleSeverity = "error" | "warning" | "info";

/**
 * Rule violation result
 */
export interface RuleViolation {
  /** Rule identifier */
  ruleId: string;
  /** Rule name */
  ruleName: string;
  /** Severity of the violation */
  severity: RuleSeverity;
  /** Human-readable message describing the violation */
  message: string;
  /** Path to the node that violates the rule (JSON Pointer) */
  path?: string;
  /** Suggested fix (if applicable) */
  suggestion?: string;
}

/**
 * Rule evaluation result
 */
export interface RuleEvaluationResult {
  /** Whether the rule passed */
  passed: boolean;
  /** Violations found (empty if passed) */
  violations: RuleViolation[];
  /** Rule identifier */
  ruleId: string;
  /** Rule name */
  ruleName: string;
}

/**
 * Design rule definition
 */
export interface DesignRule {
  /** Unique identifier for the rule */
  id: string;
  /** Human-readable name */
  name: string;
  /** Category of the rule */
  category: "spacing" | "accessibility" | "consistency";
  /** Severity level */
  severity: RuleSeverity;
  /** Description of what the rule checks */
  description: string;
  /** Evaluate the rule against a UI node */
  evaluate: (node: LayoutNode, context?: RuleEvaluationContext) => RuleEvaluationResult;
}

/**
 * Context for rule evaluation
 */
export interface RuleEvaluationContext {
  /** The full UI tree (for cross-node checks) */
  fullUI?: LayoutNode;
  /** Parent node (if evaluating a child) */
  parentNode?: LayoutNode;
  /** Path to current node (JSON Pointer) */
  path?: string;
  /** Sibling nodes (for consistency checks) */
  siblings?: LayoutNode[];
}

/**
 * Collection of rule evaluation results
 */
export interface DesignRulesEvaluation {
  /** Overall pass status (true if all error-level rules pass) */
  passed: boolean;
  /** All rule evaluation results */
  results: RuleEvaluationResult[];
  /** Summary counts */
  summary: {
    total: number;
    passed: number;
    failed: number;
    errors: number;
    warnings: number;
    info: number;
  };
}
