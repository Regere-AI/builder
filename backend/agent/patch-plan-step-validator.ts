/**
 * Validates that plan-step patches follow component addition rules.
 * Allows:
 * - Single components
 * - Multiple components of the same type (e.g., 3 buttons)
 * - Common patterns like Label+Input, Label+Textarea, Label+Select
 * - Nested structures (e.g., Card with CardHeader, CardTitle, CardContent)
 */

import type { PatchOperation } from "./patch-schema";

/** Get component name from a node */
function getComponentName(node: any): string | null {
  if (!node || typeof node !== "object") return null;
  if (node.type === "component" && node.props?.component) {
    return node.props.component;
  }
  return null;
}

/** Get all direct component children */
function getDirectComponentChildren(node: any): any[] {
  if (!node || typeof node !== "object") return [];
  const children = node.children;
  if (!Array.isArray(children)) return [];
  const componentTypes = ["component", "button", "input", "label", "textarea", "checkbox", "select"];
  return children.filter(
    (c: any) => c && typeof c === "object" && componentTypes.includes(String(c.type || "").toLowerCase())
  );
}

/** Check if all components are the same type */
function areAllSameType(components: any[]): boolean {
  if (components.length <= 1) return true;
  const names = components.map(getComponentName).filter(Boolean);
  if (names.length === 0) return true;
  const firstName = names[0];
  return names.every(name => name === firstName);
}

/** Check if this is a common allowed pattern (Label+Input, Label+Textarea, etc.) */
function isAllowedPattern(components: any[]): boolean {
  if (components.length !== 2) return false;
  
  const names = components.map(getComponentName);
  const [first, second] = names;
  
  // Allow Label + form control patterns
  const allowedPatterns = [
    ["Label", "Input"],
    ["Label", "Textarea"],
    ["Label", "Select"],
    ["Label", "Checkbox"],
    ["Label", "RadioGroup"],
    ["Label", "Slider"],
    ["Label", "Switch"],
  ];
  
  return allowedPatterns.some(([a, b]) => 
    (first === a && second === b) || (first === b && second === a)
  );
}

/** Check if this is a compound component pattern (Card, Alert, Dialog, etc.) */
function isCompoundComponentPattern(node: any): boolean {
  const componentName = getComponentName(node);
  if (!componentName) return false;
  
  // Compound components that are expected to have multiple sub-components
  const compoundComponents = [
    "Card", "Alert", "Dialog", "Accordion", "Tabs", "Breadcrumb",
    "Table", "Tooltip", "Popover", "Avatar"
  ];
  
  return compoundComponents.some(name => componentName.startsWith(name));
}

/**
 * For plan steps, validate that patches follow reasonable component addition rules.
 * Allows multiple components if they're the same type or follow common patterns.
 */
export function validatePlanStepPatchValues(
  patches: PatchOperation[],
  _stepDescription?: string
): { valid: boolean; error?: string } {
  for (let i = 0; i < patches.length; i++) {
    const op = patches[i];
    if (op.op !== "add" || op.value == null) continue;
    const value = op.value;
    if (typeof value !== "object" || !("type" in value)) continue;
    
    // If it's a single component (not a layout), allow it
    if (value.type === "component") {
      // Check if it's a compound component with nested structure
      if (isCompoundComponentPattern(value)) {
        continue; // Allow compound components with their sub-components
      }
    }
    
    // Check if it's a layout container
    const layoutTypes = ["flex", "grid", "container", "box", "stack"];
    if (!layoutTypes.includes((value as any).type)) continue;
    
    const components = getDirectComponentChildren(value);
    const count = components.length;
    
    // Allow 0 or 1 component
    if (count <= 1) continue;
    
    // Allow multiple components of the same type (e.g., 3 buttons, 5 tags)
    if (areAllSameType(components)) continue;
    
    // Allow common patterns (Label+Input, etc.)
    if (isAllowedPattern(components)) continue;
    
    // Otherwise, reject
    const componentNames = components.map(getComponentName).filter(Boolean).join(", ");
    return {
      valid: false,
      error: `Patch ${i + 1}: This step adds multiple different component types (${componentNames}). Either add components of the same type (e.g., 3 buttons) or use allowed patterns (e.g., Label+Input).`,
    };
  }
  return { valid: true };
}
