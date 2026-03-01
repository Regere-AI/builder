/**
 * Post-Processor for AI-Generated UI Layouts
 * 
 * Minimal post-processing to ensure schema compliance.
 * The system prompt should generate correct structure, this only fixes critical issues.
 */

import type { LayoutNode } from "../shared/schema";
import { isRegisteredComponent, isInteractiveComponent } from "../shared/componentNames";

/**
 * Recursively processes a LayoutNode to ensure exact schema compliance
 */
function processNode(node: any): any {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return node;
  }

  // Start with clean object - only allow type, props, children
  const processed: any = {};

  // Ensure type exists and is valid (must match LayoutRenderer: flex, grid, box, container, stack, component)
  const validTypes = ["box", "flex", "grid", "container", "stack", "component"];
  if (!validTypes.includes(node.type)) {
    // Convert invalid types to appropriate valid types
    if (node.type === "button") {
      processed.type = "component";
      processed.props = { ...processed.props, component: "Button" };
    } else if (node.type === "input") {
      processed.type = "component";
      processed.props = { ...processed.props, component: "Input" };
    } else if (node.type === "text" || node.type === "span" || node.type === "p" || node.type === "h1" || node.type === "h2" || node.type === "label") {
      processed.type = "box";
      // If it has text content, move it to children
      if (node.textContent || node.innerText) {
        processed.children = node.textContent || node.innerText;
      }
    } else if (node.type === "form" || node.type === "div") {
      processed.type = "flex";
      processed.props = { ...processed.props, direction: "column" };
    } else {
      processed.type = "box"; // Default fallback
    }
  } else {
    processed.type = node.type;
  }

  // Ensure props exists and is object
  processed.props = (node.props && typeof node.props === "object" && !Array.isArray(node.props))
    ? { ...node.props }
    : {};
  // Ensure children exists - either string or array
  if (node.children === undefined || node.children === null) {
    processed.children = "";
  } else if (typeof node.children === "string") {
    processed.children = node.children;
  } else if (Array.isArray(node.children)) {
    processed.children = node.children.map(processNode);
  } else {
    // Label (and similar) must have string children; LLM sometimes outputs object -> "[object Object]"
    if (processed.type === "component" && processed.props?.component === "Label") {
      const obj = node.children as Record<string, unknown>;
      const s = (obj?.text ?? obj?.label ?? obj?.value ?? obj?.content ?? obj?.title ?? "") as string;
      processed.children = typeof s === "string" ? s : "";
    } else {
      processed.children = "";
    }
  }

  // Avatar must have children as array of AvatarFallback (and optionally AvatarImage). Fix if LLM output string or non-array.
  if (processed.type === "component" && processed.props?.component === "Avatar") {
    const c = processed.children;
    if (c === undefined || c === null || typeof c === "string" || !Array.isArray(c)) {
      const fallbackText = typeof c === "string" && String(c).trim() ? String(c).trim() : "?";
      processed.children = [
        { type: "component", props: { component: "AvatarFallback" }, children: fallbackText },
      ];
    }
  }

  // Convert box/container with title to Card + Label (renderer does not display props.title)
  const titleStr = processed.props?.title;
  if ((processed.type === "box" || processed.type === "container") && titleStr != null && typeof titleStr === "string" && titleStr.trim() !== "") {
    const labelNode = { type: "component" as const, props: { component: "Label" }, children: titleStr.trim() };
    const existingChildren = Array.isArray(processed.children) ? processed.children : [];
    processed.type = "component";
    processed.props = { component: "Card" };
    processed.children = [labelNode, ...existingChildren];
  }

  // When model output type "button" we already set type to "component"; fix props so renderer gets component: "Button"
  if (node.type === "button" && processed.type === "component") {
    const label = processed.props?.label ?? processed.children ?? "Button";
    processed.props = {
      component: "Button",
      minWidth: 44,
      minHeight: 44,
      "aria-label": processed.props?.["aria-label"] ?? (typeof label === "string" ? label : "Button"),
      ...processed.props,
    };
    delete processed.props.label;
    if (typeof processed.children !== "string" || !processed.children) {
      processed.children = typeof label === "string" ? label : "Button";
    }
  }
  if (node.type === "input" && processed.type === "component") {
    processed.props = {
      component: "Input",
      minWidth: 44,
      minHeight: 44,
      "aria-label": processed.props?.["aria-label"] ?? processed.props?.placeholder ?? "Input",
      ...processed.props,
    };
  }

  // Only replace component type when NOT in manifest; every component in component-manifest.json is preserved and will render
  if (processed.type === "component" && processed.props.component) {
    if (!isRegisteredComponent(processed.props.component)) {
      // Convert invalid/unregistered component to box layout
      processed.type = "box";
      processed.props = {
        padding: 8,
        border: "1px solid #ccc",
        borderRadius: 4,
      };
    } else if (isInteractiveComponent(processed.props.component)) {
      // Ensure minimum dimensions and aria-label for interactive components (per manifest)
      if (!processed.props.minWidth) processed.props.minWidth = 44;
      if (!processed.props.minHeight) processed.props.minHeight = 44;
      if (!processed.props["aria-label"] && !processed.props["aria-labelledby"]) {
        if (typeof processed.children === "string" && processed.children.trim()) {
          processed.props["aria-label"] = processed.children.trim();
        } else {
          processed.props["aria-label"] = `${processed.props.component} field`;
        }
      }
    }
  }

  // Fallback: type "component" without props.component (e.g. model replaced props and dropped component name) — render as Label to avoid "Component name not specified"
  if (processed.type === "component" && !processed.props.component) {
    processed.props = { ...processed.props, component: "Label" };
  }

  return processed;
}

/**
 * Post-processes an AI response to ensure schema compliance
 */
export function postProcessAIResponse(response: any): any {
  if (!response || typeof response !== "object") {
    return response;
  }

  const processed = { ...response };

  // Ensure explanation exists
  if (!processed.explanation) {
    processed.explanation = "Generated UI layout";
  }

  // Process the UI layout node
  if (processed.ui) {
    // CRITICAL FIX: If ui is an array, wrap it in a flex container
    if (Array.isArray(processed.ui)) {
      console.warn('[POST-PROCESSOR] UI field is array, wrapping in flex container');
      processed.ui = {
        type: "flex",
        props: { direction: "column", gap: 8 },
        children: processed.ui.map(processNode)
      };
    } else {
      processed.ui = processNode(processed.ui);
    }
  }

  return processed;
}

/**
 * Post-processes a LayoutNode to ensure schema compliance
 */
export function postProcessLayoutNode(node: LayoutNode): LayoutNode {
  return processNode(node) as LayoutNode;
}