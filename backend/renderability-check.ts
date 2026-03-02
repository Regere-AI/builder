/**
 * Renderability Check for Generated UI JSON
 * 
 * Verifies that generated UI JSON can be rendered by LayoutRenderer.
 * This checks structural compatibility without requiring React setup.
 * 
 * For actual visual rendering, use the frontend LayoutRenderer component.
 */

import type { LayoutNode } from "../shared/schema";
import { validateLayoutNodeDirect } from "./agent/validator";
import { isRegisteredComponent } from "../shared/componentNames";

interface RenderabilityResult {
  renderable: boolean;
  errors: string[];
  warnings: string[];
  componentUsage: Record<string, number>;
}

/**
 * Checks if a LayoutNode is renderable by LayoutRenderer
 */
export function checkRenderability(node: LayoutNode): RenderabilityResult {
  const result: RenderabilityResult = {
    renderable: true,
    errors: [],
    warnings: [],
    componentUsage: {},
  };

  // Validate structure (same relaxed validation as app: allows string children for component text)
  const validation = validateLayoutNodeDirect(node);
  if (!validation.valid) {
    result.renderable = false;
    result.errors.push(
      `Schema validation failed: ${validation.errors?.join(", ") || "Unknown error"}`
    );
    return result;
  }

  // Recursively check nodes
  function checkNode(n: LayoutNode, path: string = "root"): void {
    if (!n || typeof n !== "object") {
      return;
    }

    // Track component usage and ensure only manifest components are used (guaranteed to render)
    if (n.type === "component" && n.props?.component) {
      const componentName = n.props.component;
      result.componentUsage[componentName] = (result.componentUsage[componentName] || 0) + 1;

      if (!componentName || typeof componentName !== "string" || componentName.trim() === "") {
        result.warnings.push(
          `Invalid component name at ${path}: component name must be a non-empty string`
        );
      } else if (!isRegisteredComponent(String(componentName).trim())) {
        result.warnings.push(
          `Component "${componentName}" at ${path} is not in the manifest and may not render. Use only components from component-manifest.json.`
        );
      }
    }

    // Check layout types - only warn on invalid types; must match LayoutRenderer
    if (n.type && n.type !== "component") {
      const validLayoutTypes = ["flex", "grid", "container", "box", "stack"];
      if (!validLayoutTypes.includes(n.type)) {
        result.warnings.push(
          `Invalid layout type "${n.type}" at ${path}. Valid types are: ${validLayoutTypes.join(", ")}`
        );
      }
    }

    // Recursively check children
    if (Array.isArray(n.children)) {
      n.children.forEach((child, index) => {
        checkNode(child, `${path}.children[${index}]`);
      });
    }
  }

  checkNode(node);

  // If there are critical errors, mark as not renderable
  if (result.errors.length > 0) {
    result.renderable = false;
  }

  return result;
}

/**
 * Formats renderability result for display
 */
export function formatRenderabilityResult(result: RenderabilityResult): string {
  const lines: string[] = [];

  if (result.renderable) {
    lines.push("[OK] Renderable: Yes");
  } else {
    lines.push("[ERROR] Renderable: No");
  }

  if (result.errors.length > 0) {
    lines.push("\nErrors:");
    result.errors.forEach((error) => {
      lines.push(`  - ${error}`);
    });
  }

  if (result.warnings.length > 0) {
    lines.push("\nWarnings:");
    result.warnings.forEach((warning) => {
      lines.push(`  [WARNING] ${warning}`);
    });
  }

  if (Object.keys(result.componentUsage).length > 0) {
    lines.push("\nComponent Usage:");
    Object.entries(result.componentUsage).forEach(([component, count]) => {
      lines.push(`  - ${component}: ${count} time(s)`);
    });
  }

  return lines.join("\n");
}
