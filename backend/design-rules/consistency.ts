/**
 * Consistency Design Rules
 * 
 * Rules for maintaining consistency across components, spacing, and typography.
 * Ensures the UI follows a cohesive design system.
 */

import type { LayoutNode } from "../../shared/schema";
import type { DesignRule, RuleEvaluationResult, RuleViolation, RuleEvaluationContext } from "./types";

/**
 * Get component name from node
 */
function getComponentName(node: LayoutNode): string | undefined {
  if (node.type !== "component") return undefined;
  const props = (node as any).props;
  return props?.component;
}

/**
 * Get component variant from props
 */
function getComponentVariant(node: LayoutNode): string | undefined {
  if (node.type !== "component") return undefined;
  const props = (node as any).props;
  if (!props) return undefined;
  
  // Check direct props (our current structure)
  return props.variant || props.size || props.type;
}

/**
 * Get gap value from node props
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
 * Get typography style from component props
 */
function getTypographyStyle(node: LayoutNode): { fontSize?: string; fontWeight?: string; fontFamily?: string } {
  if (node.type !== "component") return {};
  const props = (node as any).props;
  if (!props) return {};
  
  // Check direct props (our current structure)
  return {
    fontSize: props.fontSize || props.size,
    fontWeight: props.fontWeight || props.weight,
    fontFamily: props.fontFamily || props.font,
  };
}

/**
 * Rule: Same component type should use same variant
 */
export const componentVariantConsistencyRule: DesignRule = {
  id: "consistency.component-variant",
  name: "Component Variant Consistency",
  category: "consistency",
  severity: "warning",
  description: "Components of the same type should use consistent variants throughout the UI to maintain visual coherence.",
  evaluate: (node: LayoutNode, context?: RuleEvaluationContext): RuleEvaluationResult => {
    const violations: RuleViolation[] = [];

    if (node.type === "component" && context?.siblings) {
      const componentName = getComponentName(node);
      const variant = getComponentVariant(node);
      
      if (componentName && variant) {
        // Check siblings for same component type with different variants
        const inconsistentSiblings = context.siblings.filter(sibling => {
          const siblingName = getComponentName(sibling);
          const siblingVariant = getComponentVariant(sibling);
          return siblingName === componentName && 
                 siblingVariant !== undefined && 
                 siblingVariant !== variant;
        });
        
        if (inconsistentSiblings.length > 0) {
          violations.push({
            ruleId: "consistency.component-variant",
            ruleName: "Component Variant Consistency",
            severity: "warning",
            message: `Component "${componentName}" uses variant "${variant}" but siblings use different variants. Consider using consistent variants.`,
            path: context?.path,
            suggestion: `Use the same variant for all "${componentName}" components in this container`,
          });
        }
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      ruleId: "consistency.component-variant",
      ruleName: "Component Variant Consistency",
    };
  },
};

/**
 * Rule: Reused components should share spacing scale
 */
export const spacingScaleConsistencyRule: DesignRule = {
  id: "consistency.spacing-scale",
  name: "Spacing Scale Consistency",
  category: "consistency",
  severity: "info",
  description: "Containers with similar purposes should use consistent spacing values from a shared spacing scale.",
  evaluate: (node: LayoutNode, context?: RuleEvaluationContext): RuleEvaluationResult => {
    const violations: RuleViolation[] = [];

    if ((node.type === "flex" || node.type === "grid") && context?.siblings) {
      const gap = getGapValue(node);
      
      if (gap !== undefined) {
        // Check siblings for similar containers with different gaps
        const inconsistentSiblings = context.siblings.filter(sibling => {
          if (sibling.type !== node.type) return false;
          const siblingGap = getGapValue(sibling);
          return siblingGap !== undefined && siblingGap !== gap;
        });
        
        if (inconsistentSiblings.length > 0) {
          violations.push({
            ruleId: "consistency.spacing-scale",
            ruleName: "Spacing Scale Consistency",
            severity: "info",
            message: `Container uses gap: ${gap} but sibling containers use different gap values. Consider using a consistent spacing scale.`,
            path: context?.path,
            suggestion: "Use consistent gap values from a shared spacing scale (e.g., 2, 4, 6, 8, 12, 16)",
          });
        }
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      ruleId: "consistency.spacing-scale",
      ruleName: "Spacing Scale Consistency",
    };
  },
};

/**
 * Rule: Avoid mixing typography styles arbitrarily
 */
export const typographyConsistencyRule: DesignRule = {
  id: "consistency.typography",
  name: "Typography Consistency",
  category: "consistency",
  severity: "warning",
  description: "Text components should use consistent typography styles (font size, weight, family) to maintain visual hierarchy and readability.",
  evaluate: (node: LayoutNode, context?: RuleEvaluationContext): RuleEvaluationResult => {
    const violations: RuleViolation[] = [];

    if (node.type === "component" && context?.siblings) {
      const typography = getTypographyStyle(node);
      const componentName = getComponentName(node);
      
      // Check if it's a text-like component
      if (componentName && (
        componentName.toLowerCase().includes("text") ||
        componentName.toLowerCase().includes("heading") ||
        componentName.toLowerCase().includes("title") ||
        componentName.toLowerCase().includes("label") ||
        componentName.toLowerCase().includes("paragraph")
      )) {
        // Check siblings for similar text components with different typography
        const inconsistentSiblings = context.siblings.filter(sibling => {
          if (sibling.type !== "component") return false;
          const siblingName = getComponentName(sibling);
          if (!siblingName) return false;
          
          // Check if it's a similar text component type
          const isSimilarType = (
            (componentName.toLowerCase().includes("text") && siblingName.toLowerCase().includes("text")) ||
            (componentName.toLowerCase().includes("heading") && siblingName.toLowerCase().includes("heading")) ||
            (componentName.toLowerCase().includes("title") && siblingName.toLowerCase().includes("title"))
          );
          
          if (!isSimilarType) return false;
          
          const siblingTypography = getTypographyStyle(sibling);
          
          // Check for inconsistent typography
          return (typography.fontSize && siblingTypography.fontSize && typography.fontSize !== siblingTypography.fontSize) ||
                 (typography.fontWeight && siblingTypography.fontWeight && typography.fontWeight !== siblingTypography.fontWeight) ||
                 (typography.fontFamily && siblingTypography.fontFamily && typography.fontFamily !== siblingTypography.fontFamily);
        });
        
        if (inconsistentSiblings.length > 0) {
          violations.push({
            ruleId: "consistency.typography",
            ruleName: "Typography Consistency",
            severity: "warning",
            message: `Text component "${componentName}" uses different typography styles than similar sibling components. Consider using consistent typography.`,
            path: context?.path,
            suggestion: "Use consistent typography styles (fontSize, fontWeight, fontFamily) for similar text components",
          });
        }
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      ruleId: "consistency.typography",
      ruleName: "Typography Consistency",
    };
  },
};

/**
 * All consistency rules
 */
export const consistencyRules: DesignRule[] = [
  componentVariantConsistencyRule,
  spacingScaleConsistencyRule,
  typographyConsistencyRule,
];
