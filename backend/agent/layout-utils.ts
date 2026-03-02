/**
 * Layout structure utilities.
 * Ensures page UI has a valid root container (flex or grid) so components are properly laid out.
 */

import type { LayoutNode } from "../../shared/schema";

/**
 * Minimal initial UI used when starting from scratch in planner mode.
 * No LLM call for "Creating initial UI" — steps then apply patches to this structure.
 * Keeps step 0 instant and ensures JSON correctness by building incrementally.
 */
export const MINIMAL_INITIAL_UI: LayoutNode = {
  type: "container",
  props: {},
  children: [],
};

/**
 * Ensure the root of the layout is a flex or grid container.
 * If the root is already flex or grid, return the node unchanged.
 * Otherwise wrap the entire tree in a flex container so all page components live inside one layout container.
 */

/**
 * Find the JSON Pointer path to the first flex row's children array (for appending buttons).
 * Returns e.g. "/children/0/children/0/children/-" or null if not found.
 */
export function getFirstFlexRowChildrenPath(node: LayoutNode, pathPrefix = ""): string | null {
  if (!node || typeof node !== "object") return null;
  const children = node.children;
  if (!Array.isArray(children)) return null;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child && typeof child === "object" && "type" in child) {
      const c = child as LayoutNode;
      const segment = `${pathPrefix}/children/${i}`;
      if (c.type === "flex" && (c.props as any)?.direction === "row") {
        return `${segment}/children/-`;
      }
      const nested = getFirstFlexRowChildrenPath(c as LayoutNode, segment);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * Find the first flex column's children path (for sidebar / navigation). Used when step says "Add to sidebar".
 */
export function getFirstFlexColumnChildrenPath(node: LayoutNode, pathPrefix = ""): string | null {
  if (!node || typeof node !== "object") return null;
  const children = node.children;
  if (!Array.isArray(children)) return null;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child && typeof child === "object" && "type" in child) {
      const c = child as LayoutNode;
      const segment = `${pathPrefix}/children/${i}`;
      if (c.type === "flex" && ((c.props as any)?.direction === "column" || !(c.props as any)?.direction)) {
        return `${segment}/children/-`;
      }
      const nested = getFirstFlexColumnChildrenPath(c as LayoutNode, segment);
      if (nested) return nested;
    }
  }
  return null;
}

/** Max addressable paths to include in the prompt to avoid token overflow. */
const MAX_ADDRESSABLE_PATHS = 280;

/**
 * Collect all JSON Pointer paths that exist in the UI tree (for bounded patching).
 */
function collectAddressablePathsRec(obj: any, prefix: string, out: string[]): void {
  if (obj == null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const path = `${prefix}/${i}`;
      out.push(path);
      collectAddressablePathsRec(obj[i], path, out);
    }
    return;
  }
  for (const key of Object.keys(obj)) {
    const path = prefix ? `${prefix}/${key}` : `/${key}`;
    out.push(path);
    const val = (obj as any)[key];
    if (val != null && typeof val === "object") {
      collectAddressablePathsRec(val, path, out);
    }
  }
}

/**
 * Get a deduplicated, sorted list of addressable paths for the patch prompt.
 * Sorted by path length (shorter first); limited to MAX_ADDRESSABLE_PATHS.
 * Injects into the prompt so the LLM only uses paths from this list (reduces index hallucination).
 */
export function getAddressablePathsForPrompt(node: LayoutNode): string[] {
  const raw: string[] = [];
  collectAddressablePathsRec(node, "", raw);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const p of raw) {
    if (seen.has(p)) continue;
    seen.add(p);
    unique.push(p);
  }
  return unique
    .sort((a, b) => a.split("/").filter(Boolean).length - b.split("/").filter(Boolean).length)
    .slice(0, MAX_ADDRESSABLE_PATHS);
}

/** Paths for dashboard-style layout. When root is flex row with [sidebarCol, mainCol], use /children/0/children/- and /children/1/children/-. */
export function getDashboardLayoutPaths(node: LayoutNode): { sidebarPath: string | null; mainPath: string | null } {
  if (!node || typeof node !== "object") return { sidebarPath: null, mainPath: null };
  const children = node.children;
  if (node.type === "flex" && Array.isArray(children) && children.length >= 2) {
    const dir = (node.props as any)?.direction;
    if (dir === "row" || !dir) {
      return { sidebarPath: "/children/0/children/-", mainPath: "/children/1/children/-" };
    }
  }
  return {
    sidebarPath: getFirstFlexColumnChildrenPath(node),
    mainPath: getFirstFlexRowChildrenPath(node) || getFirstFlexColumnChildrenPath(node),
  };
}

export function ensureFlexRoot(node: LayoutNode): LayoutNode {
  if (!node || typeof node !== "object") return node;
  const type = node.type;
  if (type === "flex" || type === "grid") {
    return node;
  }
  return {
    type: "flex",
    props: {},
    children: [node],
  };
}
