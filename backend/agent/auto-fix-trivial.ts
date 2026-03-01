/**
 * Auto-fix trivial schema/structure errors before invoking LLM recovery.
 * Reduces retries for mechanical issues (e.g. missing children, invalid props shape).
 * Registry-driven fixes: strip children when acceptsChildren false, add default requiredProps.
 */

import type { LayoutNode } from "../../shared/schema";
import { getComponentMeta } from "../../shared/componentNames";
import { normalizeLayoutNode, validateLayoutNodeDirect } from "./validator";

/** Default values for common required props when missing (registry-driven auto-fix) */
const DEFAULT_REQUIRED_PROPS: Record<string, string> = {
  placeholder: "Select an option",
};

/**
 * Deep-clone and ensure every node has props as a non-null object (validator expects this).
 */
function ensurePropsObject(node: LayoutNode): LayoutNode {
  if (!node || typeof node !== "object") return node;
  const out = { ...node } as LayoutNode;
  if (out.props == null || typeof out.props !== "object" || Array.isArray(out.props)) {
    (out as any).props = {};
  } else {
    out.props = { ...out.props };
  }
  if (Array.isArray(out.children)) {
    (out as any).children = (out.children as LayoutNode[]).map((c) =>
      typeof c === "object" && c !== null ? ensurePropsObject(c as LayoutNode) : c
    );
  }
  return out;
}

/**
 * Apply registry-driven structure fixes: strip children when acceptsChildren false,
 * add default values for missing requiredProps. Mutates a clone and returns it.
 */
function applyRegistryStructureFixes(node: any): any {
  if (!node || typeof node !== "object") return node;
  const out = { ...node };
  if (out.props && typeof out.props === "object") {
    out.props = { ...out.props };
    if (out.props.componentProps && typeof out.props.componentProps === "object") {
      out.props.componentProps = { ...out.props.componentProps };
    }
  }

  if (node.type === "component") {
    const props = out.props || {};
    const componentName = props.component ?? props.componentName;
    const meta = componentName ? getComponentMeta(componentName) : null;
    if (meta) {
      if (meta.acceptsChildren === false) {
        if (Array.isArray(out.children) && out.children.length > 0) {
          out.children = [];
        }
      }
      const requiredProps = meta.requiredProps ?? [];
      for (const key of requiredProps) {
        const inProps = key in props && props[key] != null && props[key] !== "";
        const inComponentProps =
          props.componentProps &&
          typeof props.componentProps === "object" &&
          key in props.componentProps &&
          props.componentProps[key] != null &&
          props.componentProps[key] !== "";
        if (!inProps && !inComponentProps) {
          const defaultValue = DEFAULT_REQUIRED_PROPS[key];
          if (defaultValue !== undefined) {
            if (!out.props.componentProps || typeof out.props.componentProps !== "object") {
              out.props.componentProps = out.props.componentProps ?? {};
            }
            out.props.componentProps[key] = defaultValue;
          } else {
            out.props[key] = out.props[key] ?? "";
          }
        }
      }
    }
  }

  if (Array.isArray(out.children)) {
    out.children = out.children.map((c: any) =>
      typeof c === "object" && c !== null ? applyRegistryStructureFixes(c) : c
    );
  }
  return out;
}

/**
 * Try to fix trivial errors in a LayoutNode (e.g. null children, invalid props).
 * Applies registry-driven fixes (strip children for leaf components, add default requiredProps).
 * Returns a fixed LayoutNode that passes schema validation, or null if fixes did not resolve errors.
 * Does not fix: unknown component types, semantic mismatches, missing required semantic props.
 */
export function autoFixTrivialErrors(
  ui: LayoutNode,
  _validationErrors?: string[]
): LayoutNode | null {
  if (!ui || typeof ui !== "object") return null;
  const cloned = JSON.parse(JSON.stringify(ui)) as LayoutNode;
  const normalized = normalizeLayoutNode(cloned);
  let candidate: LayoutNode = normalized;
  if (validateLayoutNodeDirect(candidate).valid) {
    return candidate;
  }
  candidate = ensurePropsObject(normalized) as LayoutNode;
  if (validateLayoutNodeDirect(candidate).valid) {
    return candidate;
  }
  candidate = applyRegistryStructureFixes(
    ensurePropsObject(JSON.parse(JSON.stringify(ui)) as LayoutNode)
  ) as LayoutNode;
  if (validateLayoutNodeDirect(candidate).valid) {
    return candidate;
  }
  return null;
}
