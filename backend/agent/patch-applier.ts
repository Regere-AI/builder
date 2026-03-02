/**
 * Patch Applier
 * 
 * Applies JSON Patch operations (RFC 6902) to a LayoutNode.
 * This enables surgical edits - only the specified changes are applied.
 */

import type { PatchOperation, Patch } from "./patch-schema";
import type { LayoutNode } from "../../shared/schema";

/**
 * Result of applying a patch
 */
export interface PatchApplyResult {
  /** Whether the patch was applied successfully */
  success: boolean;
  /** The modified UI (only present if success is true, or in dry run when some ops succeeded) */
  modifiedUI?: LayoutNode;
  /** Error message (only present if success is false) */
  error?: string;
  /** When dryRun is true, all errors from failed operations (one per op) */
  errors?: string[];
}

/** Options for applyPatch / tryApplyPatches */
export interface ApplyPatchOptions {
  /** When true, simulate on a clone and collect all errors instead of failing on first (debug/recovery) */
  dryRun?: boolean;
}

/**
 * Ensure every node in the tree has a `props` object so paths like /children/0/props/style
 * always exist. This is the root-cause fix for "Path does not exist" when the LLM targets
 * node.props.* but the node was created without a props key (e.g. from planner or create).
 */
function ensurePropsOnAllNodes(node: LayoutNode): LayoutNode {
  if (!node || typeof node !== "object") return node;
  const normalized = { ...node } as LayoutNode;
  if (normalized.props == null || typeof normalized.props !== "object") {
    normalized.props = {};
  } else {
    normalized.props = { ...normalized.props };
  }
  if (Array.isArray(normalized.children)) {
    normalized.children = normalized.children.map((child) =>
      ensurePropsOnAllNodes(child as LayoutNode)
    ) as LayoutNode["children"];
  }
  return normalized;
}

/**
 * Get value at a JSON Pointer path
 */
function getValueAtPath(obj: any, path: string): any {
  const parts = path.split("/").filter((p) => p !== "");
  let current = obj;

  for (const part of parts) {
    if (Array.isArray(current)) {
      const index = parseInt(part, 10);
      if (isNaN(index) || index < 0 || index >= current.length) {
        throw new Error(`Invalid array index in path: ${path}`);
      }
      current = current[index];
    } else if (current && typeof current === "object") {
      if (!(part in current)) {
        throw new Error(`Path does not exist: ${path}`);
      }
      current = current[part];
    } else {
      throw new Error(`Cannot traverse path: ${path}`);
    }
  }

  return current;
}

/**
 * Check if a path exists in the object (safe, no throw).
 * Used by preflight validation to reject invalid patch paths before applying.
 */
function pathExists(obj: any, path: string): boolean {
  if (!path || path === "/") return true;
  const parts = path.split("/").filter((p) => p !== "");
  let current = obj;
  for (const part of parts) {
    if (Array.isArray(current)) {
      const index = parseInt(part, 10);
      if (isNaN(index) || index < 0 || index >= current.length) return false;
      current = current[index];
    } else if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      return false;
    }
  }
  return true;
}

/**
 * Normalize paths that incorrectly use /componentProps/ directly under a node.
 * In LayoutNode, componentProps lives under props: node.props.componentProps.
 * So /children/0/children/1/componentProps/colors must become /children/0/children/1/props/componentProps/colors.
 * Handles nested structures (multiple levels of children) so modifications to any component's componentProps work.
 */
function normalizePatchPath(path: string): string {
  if (!path || path === "/") return path;
  const parts = path.split("/").filter((p) => p !== "");
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (
      part === "componentProps" &&
      i > 0 &&
      /^\d+$/.test(parts[i - 1])
    ) {
      out.push("props", "componentProps");
    } else if (i > 0 && part === "componentProps" && parts[i - 1] === "props") {
      out.push(part);
    } else {
      out.push(part);
    }
  }
  return "/" + out.join("/");
}

/**
 * Parent path for validation: for "add" we require the parent to exist.
 * e.g. /children/0/children/2/props -> /children/0/children/2; /children/0/children/- -> /children/0/children
 */
function getParentPath(path: string): string {
  const trimmed = path.replace(/\/$/, "");
  if (!trimmed) return "";
  const parts = trimmed.split("/").filter((p) => p !== "");
  if (parts.length <= 1) return "";
  if (parts[parts.length - 1] === "-") {
    return "/" + parts.slice(0, -1).join("/");
  }
  return "/" + parts.slice(0, -1).join("/");
}

/**
 * Collect all paths in the UI that point to a "children" array (so we can append).
 * Used to auto-resolve invalid "add" paths when the LLM targets a non-existent path.
 */
function collectPathsToChildrenArrays(obj: any, prefix = ""): string[] {
  const out: string[] = [];
  if (obj == null || typeof obj !== "object") return out;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      out.push(...collectPathsToChildrenArrays(obj[i], `${prefix}/${i}`));
    }
    return out;
  }
  if (obj.children !== undefined && Array.isArray(obj.children)) {
    const p = prefix ? `${prefix}/children` : "/children";
    out.push(p);
    for (let i = 0; i < obj.children.length; i++) {
      out.push(...collectPathsToChildrenArrays(obj.children[i], `${prefix}/children/${i}`));
    }
  }
  return out;
}

/**
 * For "add" to path ending "/-", if the requested path doesn't exist, resolve to the nearest
 * valid "children" array in the UI (same or deeper depth, longest common prefix).
 * Returns the resolved path (ending with /-) or null if none found.
 */
function resolveAppendPath(ui: LayoutNode, requestedPath: string): string | null {
  if (!requestedPath.endsWith("/-")) return null;
  const requestedParent = getParentPath(requestedPath); // e.g. /children/0/children/0/children
  if (pathExists(ui, requestedParent)) {
    const val = getValueAtPathSafe(ui, requestedParent);
    if (Array.isArray(val)) return null; // path is valid, no resolve needed
  }
  const all = collectPathsToChildrenArrays(ui);
  const candidatePaths = all.map((p) => p + "/-");
  const requestedParts = requestedPath.split("/").filter((p) => p !== "" && p !== "-");
  let best: string | null = null;
  let bestScore = -1;
  for (const cand of candidatePaths) {
    if (!pathExists(ui, getParentPath(cand))) continue;
    const val = getValueAtPathSafe(ui, getParentPath(cand));
    if (!Array.isArray(val)) continue;
    const candParts = cand.split("/").filter((p) => p !== "" && p !== "-");
    let common = 0;
    while (common < requestedParts.length && common < candParts.length && requestedParts[common] === candParts[common]) {
      common++;
    }
    const depthMatch = Math.abs(candParts.length - requestedParts.length) <= 1 ? 1 : 0;
    const score = common * 10 + depthMatch;
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  return best;
}

/** Safe getValueAtPath: returns undefined if path doesn't exist (no throw). */
function getValueAtPathSafe(obj: any, path: string): any {
  try {
    return getValueAtPath(obj, path);
  } catch {
    return undefined;
  }
}

/**
 * Ensure object parents exist along a path by creating missing keys as {}.
 * Only creates missing object keys; does not create array indices (array must already have that index).
 * Enables deep paths like .../props/style/fontSize when props.style was undefined.
 * Never overwrites a primitive with an object (e.g. if props.style is "red", throws instead of corrupting).
 */
function ensureObjectPathExists(obj: any, path: string): void {
  const parts = path.split("/").filter((p) => p !== "");
  if (parts.length <= 1) return;
  let current: any = obj;
  let currentPath = "";
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const nextPart = parts[i + 1];
    const segmentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
    if (Array.isArray(current)) {
      const index = parseInt(part, 10);
      if (isNaN(index) || index < 0 || index >= current.length) return;
      current = current[index];
      currentPath = segmentPath;
    } else if (current != null && typeof current === "object") {
      if (part in current) {
        const existing = current[part];
        if (existing !== undefined && typeof existing !== "object") {
          throw new Error(
            `Cannot create object path over non-object at ${segmentPath} (existing value is a primitive)`
          );
        }
      } else {
        if (/^\d+$/.test(nextPart)) return;
        current[part] = {};
      }
      current = current[part];
      currentPath = segmentPath;
    } else {
      return;
    }
  }
}

/**
 * Path depth (segment count) for parent-first ordering.
 */
function pathDepth(path: string): number {
  if (!path || path === "/") return 0;
  return path.split("/").filter((p) => p !== "").length;
}

/**
 * Preflight: validate that all patch paths exist (or, for "add", that the parent exists).
 * - "add" to an array: parent must be array; path may end with /- (append) or index 0..length (insert).
 * - "add" to an object: parent must exist and be a plain object (add new key, e.g. .../props/style).
 * Fails fast before applying any patch to avoid corrupting UI state.
 */
export function validatePatchPaths(ui: LayoutNode, patches: Patch): { ok: true } | { ok: false; badPath: string; badOp: string } {
  for (const p of patches) {
    if (p.op === "replace" && isRootPath(p.path)) continue;
    if (p.op === "add" && (p.path === "/" || p.path === "")) continue;
    if (p.op === "add") {
      const parentPath = getParentPath(p.path);
      if (!parentPath) continue;
      if (!pathExists(ui, parentPath)) {
        return { ok: false, badPath: p.path, badOp: p.op };
      }
      const val = getValueAtPathSafe(ui, parentPath);
      if (Array.isArray(val)) {
        // Add to array: /- or index 0..length inclusive
        if (!p.path.endsWith("/-")) {
          const parts = p.path.split("/").filter((x) => x !== "");
          const lastPart = parts[parts.length - 1];
          const index = parseInt(lastPart, 10);
          if (!isNaN(index) && index >= 0 && index <= val.length) {
            // valid insert index
          } else if (!isNaN(index) && index >= 0) {
            return { ok: false, badPath: p.path, badOp: p.op };
          }
        }
      } else if (val != null && typeof val === "object" && !Array.isArray(val)) {
        // Add new key to object (e.g. .../props/style) — parent exists and is object; allow
      } else {
        return { ok: false, badPath: p.path, badOp: p.op };
      }
    } else if (p.op === "replace") {
      // Replace: path must exist OR parent must exist (add new key), OR parent can be created (e.g. props missing on node)
      if (pathExists(ui, p.path)) continue;
      const parentPath = getParentPath(p.path);
      if (!parentPath || parentPath === "/" || parentPath === "") continue;
      if (pathExists(ui, parentPath)) {
        const parentVal = getValueAtPathSafe(ui, parentPath);
        if (parentVal != null && typeof parentVal === "object" && !Array.isArray(parentVal)) continue;
        return { ok: false, badPath: p.path, badOp: p.op };
      }
      // Parent path doesn't exist (e.g. /children/0/props when node has no props). Allow if grandparent exists and is object so we can create parent during apply.
      const grandparentPath = getParentPath(parentPath);
      if (!grandparentPath || !pathExists(ui, grandparentPath)) {
        return { ok: false, badPath: p.path, badOp: p.op };
      }
      const grandparentVal = getValueAtPathSafe(ui, grandparentPath);
      if (grandparentVal != null && typeof grandparentVal === "object" && !Array.isArray(grandparentVal)) continue;
      return { ok: false, badPath: p.path, badOp: p.op };
    } else {
      if (!pathExists(ui, p.path)) {
        return { ok: false, badPath: p.path, badOp: p.op };
      }
    }
  }
  return { ok: true };
}

/** Minimal layout node placeholder when we need to create a path segment */
const PLACEHOLDER_NODE = { type: "flex" as const, props: {} as Record<string, unknown>, children: [] as any[] };

/**
 * Ensure the object at the given path has "children" as an array so we can set children/N.
 * If it's string or undefined, set to [] (or [existing] when converting string).
 */
function ensureChildrenArrayAtPath(obj: any, pathToParent: string): void {
  const parts = pathToParent.split("/").filter((p) => p !== "");
  if (parts.length === 0) return;
  let current: any = obj;
  for (const part of parts) {
    if (Array.isArray(current)) {
      const index = parseInt(part, 10);
      if (isNaN(index) || index < 0 || index >= current.length) return;
      current = current[index];
    } else if (current && typeof current === "object") {
      if (!(part in current)) return;
      current = current[part];
    } else {
      return;
    }
  }
  if (current && typeof current === "object" && !Array.isArray(current)) {
    const c = current.children;
    if (c === undefined || c === null) {
      current.children = [];
    } else if (typeof c === "string") {
      current.children = [c];
    } else if (!Array.isArray(c)) {
      current.children = [];
    }
  }
}

/**
 * Ensure the parent path exists so we can set a value at path (e.g. .../children/0/children).
 * Creates missing children arrays and placeholder nodes so traversal to the parent succeeds.
 */
function ensureParentPathExists(obj: any, path: string): void {
  const parts = path.split("/").filter((p) => p !== "");
  if (parts.length <= 1) return;
  const parentParts = parts.slice(0, -1);
  let current: any = obj;
  for (let i = 0; i < parentParts.length; i++) {
    const part = parentParts[i];
    if (Array.isArray(current)) {
      const index = parseInt(part, 10);
      if (isNaN(index) || index < 0) return;
      while (current.length <= index) {
        current.push(JSON.parse(JSON.stringify(PLACEHOLDER_NODE)));
      }
      current = current[index];
    } else if (current && typeof current === "object") {
      if (part === "children") {
        let c = current.children;
        if (c === undefined || c === null) current.children = c = [];
        else if (typeof c === "string") current.children = [c];
        else if (!Array.isArray(c)) current.children = [];
        current = current.children;
      } else if (part in current) {
        current = current[part];
      } else {
        return;
      }
    } else {
      return;
    }
  }
}

/**
 * Set value at a JSON Pointer path
 */
function setValueAtPath(obj: any, path: string, value: any): void {
  const parts = path.split("/").filter((p) => p !== "");
  const lastPart = parts.pop();
  
  if (!lastPart) {
    throw new Error(`Invalid path: ${path}`);
  }
  
  let current = obj;
  for (const part of parts) {
    if (Array.isArray(current)) {
      const index = parseInt(part, 10);
      if (isNaN(index) || index < 0 || index >= current.length) {
        throw new Error(`Invalid array index in path: ${path}`);
      }
      current = current[index];
    } else if (current && typeof current === "object") {
      if (!(part in current)) {
        throw new Error(`Path does not exist: ${path}`);
      }
      current = current[part];
    } else {
      throw new Error(`Cannot traverse path: ${path}`);
    }
  }
  
  if (Array.isArray(current)) {
    // Handle JSON Patch "-" convention for appending to arrays
    if (lastPart === "-") {
      // Append to array
      current.push(value);
    } else {
      const index = parseInt(lastPart, 10);
      if (isNaN(index)) {
        throw new Error(`Invalid array index in path: ${path}`);
      }
      if (index === current.length) {
        // Append to array (index equals length)
        current.push(value);
      } else if (index >= 0 && index < current.length) {
        // Replace array element
        current[index] = value;
      } else {
        throw new Error(`Array index out of bounds: ${path}`);
      }
    }
  } else if (current && typeof current === "object") {
    current[lastPart] = value;
  } else {
    throw new Error(`Cannot set value at path: ${path}`);
  }
}

/**
 * Remove value at a JSON Pointer path
 */
function removeValueAtPath(obj: any, path: string): void {
  const parts = path.split("/").filter((p) => p !== "");
  const lastPart = parts.pop();
  
  if (!lastPart) {
    throw new Error(`Invalid path: ${path}`);
  }
  
  let current = obj;
  for (const part of parts) {
    if (Array.isArray(current)) {
      const index = parseInt(part, 10);
      if (isNaN(index) || index < 0 || index >= current.length) {
        throw new Error(`Invalid array index in path: ${path}`);
      }
      current = current[index];
    } else if (current && typeof current === "object") {
      if (!(part in current)) {
        throw new Error(`Path does not exist: ${path}`);
      }
      current = current[part];
    } else {
      throw new Error(`Cannot traverse path: ${path}`);
    }
  }
  
  if (Array.isArray(current)) {
    const index = parseInt(lastPart, 10);
    if (isNaN(index) || index < 0 || index >= current.length) {
      throw new Error(`Invalid array index in path: ${path}`);
    }
    current.splice(index, 1);
  } else if (current && typeof current === "object") {
    delete current[lastPart];
  } else {
    throw new Error(`Cannot remove value at path: ${path}`);
  }
}

/**
 * Apply a single patch operation to a UI
 */
function applyPatchOperation(ui: LayoutNode, operation: PatchOperation): void {
  const { op, path, value, from } = operation;

  switch (op) {
    case "add": {
      if (value === undefined) {
        throw new Error(`"add" operation requires "value" field`);
      }
      // For add ending in "/-", ensure parent path exists at any depth (create placeholder nodes as needed)
      if (path.endsWith("/-")) {
        ensureParentPathExists(ui, path);
      } else {
        // Auto-create missing object parents (e.g. props.style when adding .../props/style/fontSize)
        ensureObjectPathExists(ui, path);
      }
      const parts = path.split("/").filter((p) => p !== "");
      const lastPart = parts.pop();
      if (lastPart) {
        let current: any = ui;
        for (const part of parts) {
          if (Array.isArray(current)) {
            const index = parseInt(part, 10);
            if (isNaN(index) || index < 0 || index >= current.length) {
              throw new Error(`Invalid array index in path: ${path}`);
            }
            current = current[index];
          } else if (current && typeof current === "object") {
            if (!(part in current)) {
              throw new Error(`Path does not exist: ${path}`);
            }
            current = current[part];
          } else {
            throw new Error(`Cannot traverse path: ${path}`);
          }
        }
        if (Array.isArray(current)) {
          if (lastPart === "-") {
            current.push(value);
          } else {
            const index = parseInt(lastPart, 10);
            if (!isNaN(index) && index >= 0 && index <= current.length) {
              // RFC 6902: "add" at array index = insert at that index (existing elements shift)
              current.splice(index, 0, value);
            } else {
              setValueAtPath(ui, path, value);
            }
          }
        } else {
          if (path.includes("/children/")) {
            const parentPath = path.replace(/\/children\/[^/]*$/, "");
            ensureChildrenArrayAtPath(ui, parentPath);
          }
          setValueAtPath(ui, path, value);
        }
      }
      break;
    }

    case "remove": {
      removeValueAtPath(ui, path);
      break;
    }

    case "replace": {
      if (value === undefined) {
        throw new Error(`"replace" operation requires "value" field`);
      }
      if (path !== "/" && path.length > 1) {
        ensureParentPathExists(ui, path);
        ensureObjectPathExists(ui, path);
      }
      if (path.includes("/children/")) {
        const parentPath = path.replace(/\/children\/[^/]*$/, "");
        ensureChildrenArrayAtPath(ui, parentPath);
      }
      // When replacing a component's props or a full component node, preserve props.component if the new value omits it — renderer requires it
      let valueToSet = value;
      if (path.endsWith("/props") && value != null && typeof value === "object" && !Array.isArray(value)) {
        try {
          const existing = getValueAtPath(ui, path);
          if (existing != null && typeof existing === "object" && !Array.isArray(existing)) {
            const existingComponent = existing.component ?? existing.componentName;
            if (existingComponent != null && (value.component == null && value.componentName == null)) {
              valueToSet = { ...value, component: existing.component ?? existing.componentName };
            }
          }
        } catch {
          // Path may not exist for some replace cases; ignore
        }
      }
      // When replacing a full node that is type "component" but has no props.component, copy from existing node at same path
      if (valueToSet != null && typeof valueToSet === "object" && !Array.isArray(valueToSet) && valueToSet.type === "component") {
        const newProps = valueToSet.props;
        if (newProps != null && typeof newProps === "object" && newProps.component == null && newProps.componentName == null) {
          try {
            const existingNode = getValueAtPath(ui, path);
            if (existingNode != null && typeof existingNode === "object" && (existingNode as any).type === "component") {
              const existingProps = (existingNode as any).props;
              const existingComponent = existingProps?.component ?? existingProps?.componentName;
              if (existingComponent != null) {
                valueToSet = {
                  ...valueToSet,
                  props: { ...newProps, component: existingProps.component ?? existingProps.componentName },
                };
              }
            }
          } catch {
            // Ignore
          }
        }
      }
      setValueAtPath(ui, path, valueToSet);
      break;
    }

    case "move": {
      if (!from) {
        throw new Error(`"move" operation requires "from" field`);
      }
      const movedValue = getValueAtPath(ui, from);
      removeValueAtPath(ui, from);
      setValueAtPath(ui, path, movedValue);
      break;
    }

    case "copy": {
      if (!from) {
        throw new Error(`"copy" operation requires "from" field`);
      }
      const copiedValue = getValueAtPath(ui, from);
      setValueAtPath(ui, path, copiedValue);
      break;
    }

    case "test": {
      if (value === undefined) {
        throw new Error(`"test" operation requires "value" field`);
      }
      const currentValue = getValueAtPath(ui, path);
      if (JSON.stringify(currentValue) !== JSON.stringify(value)) {
        throw new Error(`Test failed: value at "${path}" does not match expected value`);
      }
      break;
    }

    default:
      throw new Error(`Unknown patch operation: ${op}`);
  }
}

/** True if path is the JSON Pointer for the root (replace whole document) */
function isRootPath(path: string): boolean {
  const p = path.trim();
  return p === "" || p === "/";
}

/**
 * Minimize patches: for replace/add to the same path, keep only the last — except for
 * "add" to a path ending in "/-" (append). Repeated appends are intentional (e.g. add 4 cards);
 * collapsing them would keep only the last item.
 */
export function minimizePatches(patches: Patch): Patch {
  if (patches.length <= 1) return patches;
  const normalized = patches.map((op) => ({ ...op, path: normalizePatchPath(op.path) })) as Patch;
  const lastIndexForPath = new Map<string, number>();
  for (let i = 0; i < normalized.length; i++) {
    const op = normalized[i];
    if (op.op === "replace" || op.op === "add") {
      const path = op.path || "";
      const isAppend = op.op === "add" && path.endsWith("/-");
      if (!isAppend) {
        lastIndexForPath.set(path, i);
      }
    }
  }
  const result: Patch = [];
  for (let i = 0; i < normalized.length; i++) {
    const op = normalized[i];
    if (op.op === "replace") {
      if (lastIndexForPath.get(op.path) === i) result.push(op);
    } else if (op.op === "add") {
      const path = op.path || "";
      if (path.endsWith("/-")) {
        result.push(op);
      } else if (lastIndexForPath.get(path) === i) {
        result.push(op);
      }
    } else {
      result.push(op);
    }
  }
  return result;
}

/**
 * Apply a patch (array of operations) to a UI
 *
 * @param ui - The UI to apply patches to (will be cloned)
 * @param patch - Array of patch operations to apply
 * @param options - Optional: dryRun (collect all errors without failing on first)
 * @returns PatchApplyResult with success flag and modified UI or error
 */
export function applyPatch(ui: LayoutNode, patch: Patch, options?: ApplyPatchOptions): PatchApplyResult {
  const dryRun = options?.dryRun === true;
  try {
    // 0. Normalize UI so every node has a props object — root cause of "Path does not exist"
    // when the LLM targets /children/N/props/... but the node had no props key.
    const workingUI = ensurePropsOnAllNodes(ui);

    // 1. Minimize: collapse multiple replace/add to same path to last op only
    const minimized = minimizePatches(patch);
    // 2. Normalize paths: LLM often outputs .../children/N/componentProps/... but LayoutNode has .../children/N/props/componentProps/...
    const normalizedPatch: Patch = minimized.map((op) => ({
      ...op,
      path: normalizePatchPath(op.path),
    })) as Patch;

    // 3. Preflight: reject invalid paths before applying (fail cleanly, trigger recovery)
    let patchesToApply = normalizedPatch;
    let pathCheck = validatePatchPaths(workingUI, patchesToApply);
    let modifiedUI: LayoutNode | null = null;
    if (!pathCheck.ok) {
      // Auto-resolve: for "add" to path ending /-, find nearest valid children array and rewrite
      const failure = pathCheck as { ok: false; badPath: string; badOp: string };
      const badPath = failure.badPath;
      const badOp = failure.badOp;
      if (badOp === "add" && badPath.endsWith("/-")) {
        const resolved = resolveAppendPath(workingUI, badPath);
        if (resolved) {
          patchesToApply = normalizedPatch.map((p) => (p.op === "add" && p.path === badPath ? { ...p, path: resolved } : p)) as Patch;
          pathCheck = validatePatchPaths(workingUI, patchesToApply);
          if (pathCheck.ok) {
            console.log("[PATCH] Auto-resolved invalid append path to valid children array:", badPath, "->", resolved);
          }
        }
      }
      // Ensure parent paths exist for all "add" ops (e.g. /children/0/props when UI has no first child yet)
      if (!pathCheck.ok && badOp === "add") {
        const clone = JSON.parse(JSON.stringify(workingUI)) as LayoutNode;
        for (const p of patchesToApply) {
          if (p.op === "add" && p.path && p.path !== "/" && p.path !== "") {
            ensureParentPathExists(clone, p.path);
          }
        }
        const pathCheck2 = validatePatchPaths(clone, patchesToApply);
        if (pathCheck2.ok) {
          pathCheck = pathCheck2;
          patchesToApply = normalizedPatch;
          modifiedUI = clone;
          console.log("[PATCH] Ensured parent paths for add operations; applying patches.");
        }
      }
      if (!pathCheck.ok) {
        const err = pathCheck as { ok: false; badPath: string; badOp: string };
        console.error("[PATCH] Invalid patch path (preflight):", err.badPath, "op:", err.badOp);
        console.error("[PATCH] Current UI snapshot:", JSON.stringify(workingUI, null, 2));
        return {
          success: false,
          error: `LLM produced invalid patch path: ${err.badPath} (op: ${err.badOp}). Path does not exist in current UI.`,
        };
      }
    }

    // 4. Parent-first ordering: apply shallower paths first (containers, then children, then props)
    const sortedPatch = [...patchesToApply].sort((a, b) => pathDepth(a.path) - pathDepth(b.path));

    // Use ensured clone if we created one; otherwise deep clone the normalized UI
    if (modifiedUI == null) {
      modifiedUI = JSON.parse(JSON.stringify(workingUI)) as LayoutNode;
    }

    // Apply each operation sequentially (when dryRun, collect all errors and continue)
    const collectedErrors: string[] = [];
    for (let i = 0; i < sortedPatch.length; i++) {
      const operation = sortedPatch[i];
      try {
        // RFC 6901: path "/" means the whole document; replace replaces root
        if (operation.op === "replace" && isRootPath(operation.path) && operation.value !== undefined) {
          modifiedUI = JSON.parse(JSON.stringify(operation.value)) as LayoutNode;
          continue;
        }
        applyPatchOperation(modifiedUI, operation);
      } catch (error) {
        const errMsg = `Patch ${i} (${operation.op} ${operation.path}): ${error instanceof Error ? error.message : String(error)}`;
        if (dryRun) {
          collectedErrors.push(errMsg);
          console.warn("[PATCH] Dry run —", errMsg);
        } else {
          console.error("[PATCH] Bad patch path:", operation.path);
          console.error("[PATCH] Current UI snapshot:", JSON.stringify(modifiedUI, null, 2));
          return {
            success: false,
            error: `Failed to apply patch operation ${i} (${operation.op} ${operation.path}): ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }
    }

    if (dryRun && collectedErrors.length > 0) {
      return {
        success: false,
        error: collectedErrors[0],
        errors: collectedErrors,
      };
    }

    // Post-apply cleanup: remove "Plan 1", "Plan 2", "Plan 3" placeholder cards when they are siblings of a section that already has real content (e.g. pricing cards)
    modifiedUI = removePlaceholderPlanCards(modifiedUI) as LayoutNode;

    return {
      success: true,
      modifiedUI,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Try applying patches (optionally in dry-run mode).
 * When dryRun: true, applies to a clone and collects all operation errors instead of failing on first.
 * Use for better error messages, debugging, and recovery logic.
 */
export function tryApplyPatches(ui: LayoutNode, patch: Patch, options?: ApplyPatchOptions): PatchApplyResult {
  return applyPatch(ui, patch, options);
}

/** Card with single Label child whose text is "Plan 1", "Plan 2", or "Plan 3" */
function isPlaceholderPlanCard(node: any): boolean {
  if (!node || typeof node !== "object") return false;
  const c = node.props?.component;
  if (c !== "Card") return false;
  const ch = node.children;
  if (!Array.isArray(ch) || ch.length !== 1) return false;
  const first = ch[0];
  if (!first || first.props?.component !== "Label") return false;
  const labelText = first.children;
  return typeof labelText === "string" && /^Plan [123]$/.test(labelText.trim());
}

/** Flex node that contains at least one card with multiple children or a Button (real content) */
function flexHasRealCards(node: any): boolean {
  if (!node || node.type !== "flex" || !Array.isArray(node.children)) return false;
  return node.children.some((child: any) => {
    if (!child?.props?.component) return false;
    if (child.props.component === "Card") {
      const cc = child.children;
      const len = Array.isArray(cc) ? cc.length : 0;
      if (len >= 2) return true;
      if (len === 1 && Array.isArray(cc)) {
        const c0 = cc[0];
        return c0?.props?.component === "Button";
      }
    }
    return false;
  });
}

/** True if this node or any descendant is a flex with real cards */
function nodeOrDescendantHasRealFlex(node: any): boolean {
  if (!node || typeof node !== "object") return false;
  if (flexHasRealCards(node)) return true;
  if (!Array.isArray(node.children)) return false;
  return node.children.some((c: any) => nodeOrDescendantHasRealFlex(c));
}

/**
 * Remove placeholder "Plan 1", "Plan 2", "Plan 3" cards when they appear as siblings of a section that already has real content (e.g. flex row with pricing cards).
 */
function removePlaceholderPlanCards(node: any): any {
  if (!node || typeof node !== "object") return node;
  if (!Array.isArray(node.children)) return node;
  const children = node.children as any[];
  const hasRealFlex = children.some((c: any) => nodeOrDescendantHasRealFlex(c));
  const hasPlaceholders = children.some((c: any) => isPlaceholderPlanCard(c));
  if (!hasRealFlex || !hasPlaceholders) {
    return { ...node, children: children.map((c: any) => removePlaceholderPlanCards(c)) };
  }
  const filtered = children.filter((c: any) => !isPlaceholderPlanCard(c)).map((c: any) => removePlaceholderPlanCards(c));
  return { ...node, children: filtered };
}
