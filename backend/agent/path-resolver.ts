/**
 * Path Resolver — semantic targets to JSON Pointer paths
 *
 * The LLM must never choose array indices; it chooses semantic targets (by id or componentType).
 * Runtime resolves targets to actual paths so patches always use valid indices.
 */

import type { LayoutNode } from "../../shared/schema";
import { getComponentMeta } from "../../shared/componentNames";

/** One addressable node in the UI tree (exposed to the LLM as a target, not as a path). */
export interface AddressableTarget {
  /** Stable id for this node (e.g. "0", "0_1"). Use this in patch "target" for reliable resolution. */
  id: string;
  /** JSON Pointer path (used internally; do not send to LLM as the primary key). */
  path: string;
  /** Component type: "flex", "grid", "container", or props.component for type "component". */
  componentType: string;
  /** Whether this node can accept children (containers only). */
  acceptsChildren: boolean;
  /** Optional label for disambiguation (e.g. "Header", "Sidebar") when multiple same type exist. */
  label?: string;
}

/** Path to a stable id: /children/0/children/1 -> "0_1" (indices only). */
function pathToStableId(path: string): string {
  const parts = path.split("/").filter((p) => p !== "");
  const indices: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "children" && i + 1 < parts.length && /^\d+$/.test(parts[i + 1])) {
      indices.push(parts[i + 1]);
      i++;
    }
  }
  return indices.length > 0 ? indices.join("_") : "root";
}

function getNodeComponentType(node: LayoutNode): string {
  if (!node || typeof node !== "object") return "unknown";
  if (node.type === "flex" || node.type === "grid") return node.type;
  if (node.type === "container") return "container";
  if (node.type === "component" && node.props && typeof node.props === "object") {
    const comp = (node.props as any).component ?? (node.props as any).componentName;
    return typeof comp === "string" ? comp : "component";
  }
  return "unknown";
}

function nodeAcceptsChildren(node: LayoutNode): boolean {
  if (!node || typeof node !== "object") return false;
  if (node.type === "flex" || node.type === "grid" || node.type === "container") return true;
  if (node.type === "component") {
    const comp = (node.props as any)?.component ?? (node.props as any)?.componentName;
    if (typeof comp !== "string") return false;
    const meta = getComponentMeta(comp);
    return meta?.acceptsChildren !== false;
  }
  return false;
}

/**
 * Collect all addressable targets from the UI tree.
 * Each target has a stable id and path; use id in patches so runtime can resolve to path.
 */
export function getAddressableTargets(ui: LayoutNode): AddressableTarget[] {
  const out: AddressableTarget[] = [];

  function walk(node: LayoutNode, pathPrefix: string): void {
    if (!node || typeof node !== "object") return;
    const path = pathPrefix ? `${pathPrefix}/children` : "/children";
    const children = node.children;
    if (!Array.isArray(children)) return;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!child || typeof child !== "object") continue;
      const c = child as LayoutNode;
      const segment = `${path}/${i}`;
      const id = pathToStableId(segment);
      const componentType = getNodeComponentType(c);
      const acceptsChildren = nodeAcceptsChildren(c);
      out.push({
        id,
        path: segment,
        componentType,
        acceptsChildren,
      });
      walk(c, segment);
    }
  }

  // Root is addressable as "root" (path "" = root node; getAppendPath("") -> "/children/-")
  const rootAcceptsChildren = nodeAcceptsChildren(ui);
  out.push({
    id: "root",
    path: "",
    componentType: getNodeComponentType(ui),
    acceptsChildren: rootAcceptsChildren,
  });
  walk(ui, "");
  return out;
}

/** Target specified by the LLM: either a string id or { componentType: string }. */
export type SemanticTarget = string | { componentType: string };

/**
 * Resolve a semantic target to a single JSON Pointer path.
 * - If target is a string, look up by id in addressable targets (exact match).
 * - Fallback: when only "root" exists (e.g. empty layout), "0" / "1" are resolved to root so the model can append.
 * - If target is { componentType: "X" }, find first node with that componentType that accepts children (for add) or any match (for remove/update).
 * Returns null if not found or ambiguous (multiple matches for componentType without id).
 */
export function resolveTarget(
  target: SemanticTarget,
  targets: AddressableTarget[],
  options?: { forAdd?: boolean }
): string | null {
  const forAdd = options?.forAdd === true;

  if (typeof target === "string") {
    const t = targets.find((x) => x.id === target);
    if (t) return t.path;
    // Robust fallback: model often outputs "0" or "1" for "first container"; when tree has no children only "root" exists.
    if (forAdd && /^\d+$/.test(target.trim())) {
      const rootTarget = targets.find((x) => x.id === "root" && x.acceptsChildren);
      if (rootTarget) return rootTarget.path;
      const firstContainer = targets.find((x) => x.acceptsChildren);
      if (firstContainer) return firstContainer.path;
    }
    return null;
  }

  if (target && typeof target === "object" && typeof (target as any).componentType === "string") {
    const want = (target as any).componentType as string;
    const matches = targets.filter((t) => t.componentType === want);
    if (matches.length === 0) return null;
    if (forAdd) {
      const containers = matches.filter((t) => t.acceptsChildren);
      if (containers.length === 0) return null;
      return containers[0].path;
    }
    return matches[0].path;
  }

  return null;
}

/**
 * Get the path to use for "add" with position "append": resolved path (to container node) + "/children/-".
 * containerPath may be "" (root) or "/children/0" etc.
 */
export function getAppendPath(containerPath: string): string {
  const normalized = (containerPath || "").replace(/\/$/, "").trim();
  return normalized ? `${normalized}/children/-` : "/children/-";
}

/**
 * Get the path to use for "add" with position "prepend": resolved path + "/children/0".
 */
export function getPrependPath(containerPath: string): string {
  const normalized = (containerPath || "").replace(/\/$/, "").trim();
  return normalized ? `${normalized}/children/0` : "/children/0";
}
