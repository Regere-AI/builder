/**
 * Design Rules Evaluator
 * 
 * Functions to evaluate design rules against a UI tree.
 */

import type { LayoutNode } from "../../shared/schema";
import type { DesignRule, RuleEvaluationResult, DesignRulesEvaluation, RuleEvaluationContext } from "./types";
import { spacingRules } from "./spacing";
import { accessibilityRules } from "./accessibility";
import { consistencyRules } from "./consistency";

/**
 * All design rules
 */
export const allDesignRules: DesignRule[] = [
  ...spacingRules,
  ...accessibilityRules,
  ...consistencyRules,
];

/**
 * Build evaluation context for a node
 */
function buildContext(
  node: LayoutNode,
  fullUI: LayoutNode,
  path: string = "",
  parentNode?: LayoutNode,
  siblings?: LayoutNode[]
): RuleEvaluationContext {
  return {
    fullUI,
    parentNode,
    path,
    siblings,
  };
}

/**
 * Traverse UI tree and collect all nodes with their paths
 */
function traverseTree(
  node: LayoutNode,
  fullUI: LayoutNode,
  path: string = "",
  parentNode?: LayoutNode,
  allNodes: Array<{ node: LayoutNode; path: string; parent?: LayoutNode; siblings?: LayoutNode[] }> = []
): Array<{ node: LayoutNode; path: string; parent?: LayoutNode; siblings?: LayoutNode[] }> {
  // Add current node
  const siblings = parentNode && Array.isArray((parentNode as any).children)
    ? (parentNode as any).children.filter((n: LayoutNode, i: number) => {
        const siblingPath = path.split("/").slice(0, -1).join("/") + `/${i}`;
        return siblingPath !== path;
      })
    : undefined;
  
  allNodes.push({ node, path, parent: parentNode, siblings });
  
  // Traverse children
  if (node.children && Array.isArray(node.children) && node.children.length > 0) {
    node.children.forEach((child, index) => {
      const childPath = path ? `${path}/children/${index}` : `/children/${index}`;
      traverseTree(child, fullUI, childPath, node, allNodes);
    });
  }
  
  return allNodes;
}

/**
 * Evaluate a single rule against a UI node
 */
export function evaluateRule(
  rule: DesignRule,
  node: LayoutNode,
  context?: RuleEvaluationContext
): RuleEvaluationResult {
  return rule.evaluate(node, context);
}

/**
 * Evaluate all rules against a single node
 */
export function evaluateAllRulesForNode(
  node: LayoutNode,
  context?: RuleEvaluationContext
): RuleEvaluationResult[] {
  return allDesignRules.map(rule => evaluateRule(rule, node, context));
}

/**
 * Evaluate all rules against the entire UI tree
 */
export function evaluateAllRules(ui: LayoutNode): DesignRulesEvaluation {
  const allNodes = traverseTree(ui, ui);
  const allResults: RuleEvaluationResult[] = [];
  
  // Evaluate each rule against each node
  for (const { node, path, parent, siblings } of allNodes) {
    const context = buildContext(node, ui, path, parent, siblings);
    const nodeResults = evaluateAllRulesForNode(node, context);
    allResults.push(...nodeResults);
  }
  
  // Calculate summary
  const errors = allResults.filter(r => r.violations.some(v => v.severity === "error"));
  const warnings = allResults.filter(r => r.violations.some(v => v.severity === "warning"));
  const info = allResults.filter(r => r.violations.some(v => v.severity === "info"));
  
  const summary = {
    total: allResults.length,
    passed: allResults.filter(r => r.passed).length,
    failed: allResults.filter(r => !r.passed).length,
    errors: errors.length,
    warnings: warnings.length,
    info: info.length,
  };
  
  // Overall pass if no error-level violations
  const passed = errors.length === 0;
  
  return {
    passed,
    results: allResults,
    summary,
  };
}

/**
 * Get all violations from an evaluation
 */
export function getAllViolations(evaluation: DesignRulesEvaluation): Array<{
  rule: RuleEvaluationResult;
  violation: import("./types").RuleViolation;
}> {
  const violations: Array<{
    rule: RuleEvaluationResult;
    violation: import("./types").RuleViolation;
  }> = [];
  
  for (const result of evaluation.results) {
    for (const violation of result.violations) {
      violations.push({ rule: result, violation });
    }
  }
  
  return violations;
}

/**
 * Get violations by severity
 */
export function getViolationsBySeverity(
  evaluation: DesignRulesEvaluation,
  severity: import("./types").RuleSeverity
): import("./types").RuleViolation[] {
  const allViolations = getAllViolations(evaluation);
  return allViolations
    .filter(({ violation }) => violation.severity === severity)
    .map(({ violation }) => violation);
}

/**
 * Get violations by category
 */
export function getViolationsByCategory(
  evaluation: DesignRulesEvaluation,
  category: "spacing" | "accessibility" | "consistency"
): import("./types").RuleViolation[] {
  const allViolations = getAllViolations(evaluation);
  return allViolations
    .filter(({ rule }) => {
      const ruleDef = allDesignRules.find(r => r.id === rule.ruleId);
      return ruleDef?.category === category;
    })
    .map(({ violation }) => violation);
}

/**
 * Format violations as human-readable messages
 */
export function formatViolations(evaluation: DesignRulesEvaluation): string[] {
  const violations = getAllViolations(evaluation);
  return violations.map(({ violation }) => {
    const path = violation.path ? ` at ${violation.path}` : "";
    const suggestion = violation.suggestion ? ` (Suggestion: ${violation.suggestion})` : "";
    return `[${violation.severity.toUpperCase()}] ${violation.ruleName}${path}: ${violation.message}${suggestion}`;
  });
}
