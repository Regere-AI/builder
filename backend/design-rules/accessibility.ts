/**
 * Accessibility Design Rules
 * 
 * Rules for accessibility, including labels, contrast, and interactive element sizing.
 * Ensures UI is usable by people with disabilities.
 */

import type { LayoutNode } from "../../shared/schema";
import type { DesignRule, RuleEvaluationResult, RuleViolation, RuleEvaluationContext } from "./types";

/**
 * Minimum size for interactive elements (touch targets)
 */
const MIN_INTERACTIVE_SIZE = 44; // pixels (WCAG 2.1 Level AAA recommendation)

/**
 * Minimum text contrast ratio (WCAG 2.1 Level AA)
 */
const MIN_TEXT_CONTRAST_RATIO = 4.5;

/**
 * Minimum text contrast ratio for large text (WCAG 2.1 Level AA)
 */
const MIN_LARGE_TEXT_CONTRAST_RATIO = 3.0;

/**
 * Check if a component is interactive (button, link, input, etc.)
 */
function isInteractiveComponent(node: LayoutNode): boolean {
  if (node.type !== "component") return false;
  const props = (node as any).props;
  if (!props || !props.component) return false;
  const componentName = props.component.toLowerCase();
  // Match our actual registered components
  return componentName === "button" || 
         componentName === "input" || 
         componentName === "select" || 
         componentName === "checkbox" || 
         componentName === "radio" || 
         componentName === "switch" ||
         componentName === "textarea";
}

/**
 * Check if a component needs an accessible label
 */
function needsAccessibleLabel(node: LayoutNode): boolean {
  if (node.type !== "component") return false;
  const props = (node as any).props;
  if (!props || !props.component) return false;
  const componentName = props.component.toLowerCase();
  // Match our actual registered components
  return componentName === "button" || 
         componentName === "input" || 
         componentName === "select" || 
         componentName === "textarea" ||
         componentName === "checkbox" || 
         componentName === "radio" ||
         componentName === "switch";
}

/**
 * Check if component has accessible label (aria-label, aria-labelledby, or visible text)
 */
function hasAccessibleLabel(node: LayoutNode): boolean {
  if (node.type !== "component") return false;
  const props = (node as any).props;
  if (!props) return false;
  
  // Check for aria-label directly in props (our current structure)
  if (props["aria-label"] || props.ariaLabel) {
    return true;
  }
  
  // Check for aria-labelledby
  if (props["aria-labelledby"] || props.ariaLabelledBy) {
    return true;
  }
  
  // Check for visible text content in children
  const children = (node as any).children;
  if (children && typeof children === "string" && children.trim()) {
    return true;
  }
  
  // Check if component has children nodes with text
  if (children && Array.isArray(children) && children.length > 0) {
    return true;
  }
  
  return false;
}

/**
 * Get minimum size from node props
 */
function getMinSize(node: LayoutNode): { width?: number; height?: number } {
  const props = (node as any).props;
  if (!props) return {};
  
  const width = props.minWidth || props.width;
  const height = props.minHeight || props.height;
  
  return {
    width: typeof width === "number" ? width : undefined,
    height: typeof height === "number" ? height : undefined,
  };
}

/**
 * Rule: Interactive elements must have minimum size
 */
export const interactiveElementSizeRule: DesignRule = {
  id: "accessibility.interactive-size",
  name: "Interactive Element Minimum Size",
  category: "accessibility",
  severity: "warning",
  description: `Interactive elements (buttons, links, inputs) must have a minimum size of ${MIN_INTERACTIVE_SIZE}px to meet WCAG 2.1 touch target requirements.`,
  evaluate: (node: LayoutNode, context?: RuleEvaluationContext): RuleEvaluationResult => {
    const violations: RuleViolation[] = [];

    if (isInteractiveComponent(node)) {
      const size = getMinSize(node);
      const hasMinWidth = size.width !== undefined && size.width >= MIN_INTERACTIVE_SIZE;
      const hasMinHeight = size.height !== undefined && size.height >= MIN_INTERACTIVE_SIZE;
      
      if (!hasMinWidth || !hasMinHeight) {
        violations.push({
          ruleId: "accessibility.interactive-size",
          ruleName: "Interactive Element Minimum Size",
          severity: "warning",
          message: `Interactive element should have minimum dimensions of ${MIN_INTERACTIVE_SIZE}x${MIN_INTERACTIVE_SIZE}px. Current: ${size.width ?? "auto"}x${size.height ?? "auto"}`,
          path: context?.path,
          suggestion: `Add minWidth: ${MIN_INTERACTIVE_SIZE} and minHeight: ${MIN_INTERACTIVE_SIZE} to the component container props`,
        });
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      ruleId: "accessibility.interactive-size",
      ruleName: "Interactive Element Minimum Size",
    };
  },
};

/**
 * Rule: Interactive elements must have accessible labels
 */
export const accessibleLabelRule: DesignRule = {
  id: "accessibility.accessible-label",
  name: "Accessible Label Requirement",
  category: "accessibility",
  severity: "warning",
  description: "Interactive elements must have accessible labels (aria-label, aria-labelledby, or visible text) for screen readers.",
  evaluate: (node: LayoutNode, context?: RuleEvaluationContext): RuleEvaluationResult => {
    const violations: RuleViolation[] = [];

    if (needsAccessibleLabel(node) && !hasAccessibleLabel(node)) {
      violations.push({
        ruleId: "accessibility.accessible-label",
        ruleName: "Accessible Label Requirement",
        severity: "warning",
        message: "Interactive element must have an accessible label (aria-label, aria-labelledby, or visible text content).",
        path: context?.path,
        suggestion: "Add aria-label, aria-labelledby, or visible text content to the component",
      });
    }

    return {
      passed: violations.length === 0,
      violations,
      ruleId: "accessibility.accessible-label",
      ruleName: "Accessible Label Requirement",
    };
  },
};

/**
 * Rule: Text should have adequate contrast
 * Note: This is a structural check - actual contrast calculation requires color values
 */
export const textContrastRule: DesignRule = {
  id: "accessibility.text-contrast",
  name: "Text Contrast Requirement",
  category: "accessibility",
  severity: "warning",
  description: `Text should have a contrast ratio of at least ${MIN_TEXT_CONTRAST_RATIO}:1 (${MIN_LARGE_TEXT_CONTRAST_RATIO}:1 for large text) to meet WCAG 2.1 Level AA requirements.`,
  evaluate: (node: LayoutNode, context?: RuleEvaluationContext): RuleEvaluationResult => {
    const violations: RuleViolation[] = [];

    // This is a structural check - we can't calculate actual contrast without color values
    // We check if text components have explicit color/background styling
    if (node.type === "component") {
      const props = (node as any).props;
      const componentName = props?.component?.toLowerCase() || "";
      
      // Check if it's a text-like component (match our actual components)
      if (componentName === "label" || 
          componentName === "text" || 
          componentName === "heading") {
        
        const hasExplicitColor = props.color || props.textColor;
        const hasExplicitBackground = props.backgroundColor || props.bg;
        
        // If no explicit color styling, suggest adding it for contrast control
        if (!hasExplicitColor && !hasExplicitBackground) {
          violations.push({
            ruleId: "accessibility.text-contrast",
            ruleName: "Text Contrast Requirement",
            severity: "info",
            message: `Text component should have explicit color and background styling to ensure adequate contrast (minimum ${MIN_TEXT_CONTRAST_RATIO}:1 ratio).`,
            path: context?.path,
            suggestion: "Add explicit color and background properties to ensure WCAG 2.1 Level AA contrast requirements",
          });
        }
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      ruleId: "accessibility.text-contrast",
      ruleName: "Text Contrast Requirement",
    };
  },
};

/**
 * All accessibility rules
 */
export const accessibilityRules: DesignRule[] = [
  interactiveElementSizeRule,
  accessibleLabelRule,
  textContrastRule,
];
