/**
 * Spacing Design Rules
 * 
 * Rules for spacing, margins, padding, and layout gaps.
 * Ensures consistent spacing throughout the UI.
 */

import type { LayoutNode } from "../../shared/schema";
import type { DesignRule, RuleEvaluationResult, RuleViolation, RuleEvaluationContext } from "./types";

/**
 * Minimum gap for vertical stacks (flex with direction: column)
 */
const MIN_VERTICAL_STACK_GAP = 4;

/**
 * Minimum gap for horizontal stacks (flex with direction: row)
 */
const MIN_HORIZONTAL_STACK_GAP = 4;

/**
 * Minimum spacing between form inputs
 */
const MIN_FORM_INPUT_GAP = 6;

/**
 * Minimum top margin for headings (relative to body text)
 */
const MIN_HEADING_TOP_MARGIN = 8;

/**
 * Check if a flex container is a vertical stack
 */
function isVerticalStack(node: LayoutNode): boolean {
  if (node.type !== "flex") return false;
  const props = (node as any).props;
  if (!props) return false;
  const direction = props.direction;
  return direction === "column" || direction === "column-reverse" || !direction; // default is column
}

/**
 * Check if a flex container is a horizontal stack
 */
function isHorizontalStack(node: LayoutNode): boolean {
  if (node.type !== "flex") return false;
  const props = (node as any).props;
  if (!props) return false;
  const direction = props.direction;
  return direction === "row" || direction === "row-reverse";
}

/**
 * Get gap value from node props (handles responsive values)
 */
function getGapValue(node: LayoutNode): number | undefined {
  const props = (node as any).props;
  if (!props || !props.gap) return undefined;
  const gap = props.gap;
  // Handle responsive values
  if (typeof gap === "object" && gap !== null) {
    return gap.default || gap.md || gap.lg || gap.sm;
  }
  return typeof gap === "number" ? gap : undefined;
}

/**
 * Check if node appears to be a heading component
 */
function isHeadingComponent(node: LayoutNode): boolean {
  if (node.type !== "component") return false;
  const props = (node as any).props;
  if (!props || !props.component) return false;
  const componentName = props.component.toLowerCase();
  return componentName.includes("heading") || 
         componentName.includes("title") || 
         componentName === "h1" || 
         componentName === "h2" || 
         componentName === "h3" || 
         componentName === "h4" || 
         componentName === "h5" || 
         componentName === "h6";
}

/**
 * Check if node appears to be a form input component
 */
function isFormInputComponent(node: LayoutNode): boolean {
  if (node.type !== "component") return false;
  const props = (node as any).props;
  if (!props || !props.component) return false;
  const componentName = props.component.toLowerCase();
  // Match our actual registered components
  return componentName === "input" || 
         componentName === "select" || 
         componentName === "textarea";
}

/**
 * Rule: Vertical stacks require minimum spacing
 */
export const verticalStackSpacingRule: DesignRule = {
  id: "spacing.vertical-stack-gap",
  name: "Vertical Stack Minimum Gap",
  category: "spacing",
  severity: "warning",
  description: "Vertical flex containers (stacks) should have a minimum gap of 4 units to ensure readable spacing between elements.",
  evaluate: (node: LayoutNode, context?: RuleEvaluationContext): RuleEvaluationResult => {
    const violations: RuleViolation[] = [];

    if (isVerticalStack(node) && node.children && Array.isArray(node.children) && node.children.length > 1) {
      const gap = getGapValue(node);
      if (gap === undefined || gap < MIN_VERTICAL_STACK_GAP) {
        violations.push({
          ruleId: "spacing.vertical-stack-gap",
          ruleName: "Vertical Stack Minimum Gap",
          severity: "warning",
          message: `Vertical stack should have a minimum gap of ${MIN_VERTICAL_STACK_GAP} units. Current gap: ${gap ?? "none"}`,
          path: context?.path,
          suggestion: `Add gap: ${MIN_VERTICAL_STACK_GAP} to the flex container props`,
        });
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      ruleId: "spacing.vertical-stack-gap",
      ruleName: "Vertical Stack Minimum Gap",
    };
  },
};

/**
 * Rule: Horizontal stacks require minimum spacing
 */
export const horizontalStackSpacingRule: DesignRule = {
  id: "spacing.horizontal-stack-gap",
  name: "Horizontal Stack Minimum Gap",
  category: "spacing",
  severity: "warning",
  description: "Horizontal flex containers should have a minimum gap of 4 units to ensure readable spacing between elements.",
  evaluate: (node: LayoutNode, context?: RuleEvaluationContext): RuleEvaluationResult => {
    const violations: RuleViolation[] = [];

    if (isHorizontalStack(node) && node.children && Array.isArray(node.children) && node.children.length > 1) {
      const gap = getGapValue(node);
      if (gap === undefined || gap < MIN_HORIZONTAL_STACK_GAP) {
        violations.push({
          ruleId: "spacing.horizontal-stack-gap",
          ruleName: "Horizontal Stack Minimum Gap",
          severity: "warning",
          message: `Horizontal stack should have a minimum gap of ${MIN_HORIZONTAL_STACK_GAP} units. Current gap: ${gap ?? "none"}`,
          path: context?.path,
          suggestion: `Add gap: ${MIN_HORIZONTAL_STACK_GAP} to the flex container props`,
        });
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      ruleId: "spacing.horizontal-stack-gap",
      ruleName: "Horizontal Stack Minimum Gap",
    };
  },
};

/**
 * Rule: Form inputs should be grouped with adequate spacing
 */
export const formInputSpacingRule: DesignRule = {
  id: "spacing.form-input-gap",
  name: "Form Input Grouping Spacing",
  category: "spacing",
  severity: "warning",
  description: "Form inputs should be grouped in containers with adequate spacing (minimum 6 units) to improve readability and usability.",
  evaluate: (node: LayoutNode, context?: RuleEvaluationContext): RuleEvaluationResult => {
    const violations: RuleViolation[] = [];

    if (node.children && Array.isArray(node.children) && node.children.length > 0) {
      const hasFormInputs = node.children.some(child => isFormInputComponent(child));
      
      if (hasFormInputs && (node.type === "flex" || node.type === "grid")) {
        const gap = getGapValue(node);
        if (gap === undefined || gap < MIN_FORM_INPUT_GAP) {
          violations.push({
            ruleId: "spacing.form-input-gap",
            ruleName: "Form Input Grouping Spacing",
            severity: "warning",
            message: `Form input container should have a minimum gap of ${MIN_FORM_INPUT_GAP} units. Current gap: ${gap ?? "none"}`,
            path: context?.path,
            suggestion: `Add gap: ${MIN_FORM_INPUT_GAP} to the form container props`,
          });
        }
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      ruleId: "spacing.form-input-gap",
      ruleName: "Form Input Grouping Spacing",
    };
  },
};

/**
 * Rule: Headings should have adequate top margin
 */
export const headingTopMarginRule: DesignRule = {
  id: "spacing.heading-top-margin",
  name: "Heading Top Margin",
  category: "spacing",
  severity: "info",
  description: "Headings should have more top margin than body text to create visual hierarchy and improve readability.",
  evaluate: (node: LayoutNode, context?: RuleEvaluationContext): RuleEvaluationResult => {
    const violations: RuleViolation[] = [];

    if (isHeadingComponent(node)) {
      const props = (node as any).props;
      const marginTop = props?.marginTop || props?.marginY || props?.margin;
      
      // Check if parent is a flex container with gap (which provides spacing)
      const parentHasGap = context?.parentNode && 
        (context.parentNode.type === "flex" || context.parentNode.type === "grid") &&
        getGapValue(context.parentNode) !== undefined;

      // If parent has gap, that's acceptable
      if (!parentHasGap) {
        const marginValue = typeof marginTop === "object" && marginTop !== null
          ? (marginTop.default || marginTop.md || marginTop.lg || marginTop.sm)
          : marginTop;
        
        if (marginValue === undefined || (typeof marginValue === "number" && marginValue < MIN_HEADING_TOP_MARGIN)) {
          violations.push({
            ruleId: "spacing.heading-top-margin",
            ruleName: "Heading Top Margin",
            severity: "info",
            message: `Headings should have at least ${MIN_HEADING_TOP_MARGIN} units of top margin for visual hierarchy.`,
            path: context?.path,
            suggestion: `Add marginTop: ${MIN_HEADING_TOP_MARGIN} to the heading component props, or ensure parent container has adequate gap`,
          });
        }
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      ruleId: "spacing.heading-top-margin",
      ruleName: "Heading Top Margin",
    };
  },
};

/**
 * All spacing rules
 */
export const spacingRules: DesignRule[] = [
  verticalStackSpacingRule,
  horizontalStackSpacingRule,
  formInputSpacingRule,
  headingTopMarginRule,
];
