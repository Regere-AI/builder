/**
 * Semantic Patch — LLM outputs targets, runtime resolves to paths
 *
 * Converts mixed semantic + path-based patches from the LLM into pure JSON Patch
 * so the applier never sees invalid indices. When count + values are provided,
 * runtime expands to N add ops (no path collapsing). On resolution failure returns
 * allowedTargets for retry.
 */

import type { LayoutNode } from "../../shared/schema";
import type { Patch, PatchOperation } from "./patch-schema";
import {
  getAddressableTargets,
  resolveTarget,
  getAppendPath,
  getPrependPath,
  type AddressableTarget,
  type SemanticTarget,
} from "./path-resolver";

/**
 * Build a LayoutNode for a given component and label/title value.
 * Used when expanding count + values into N add ops (Card with title, Button with label, etc.).
 */
function buildNodeFromComponentAndValue(component: string, value: any): LayoutNode {
  const str = value != null ? String(value) : "";
  const comp = String(component);
  const node = (obj: object): LayoutNode => obj as unknown as LayoutNode;
  switch (comp) {
    case "Card":
      return node({
        type: "component",
        props: { component: "Card" },
        children: [
          { type: "component", props: { component: "Label" }, children: str },
        ],
      });
    case "Button":
      return node({
        type: "component",
        props: {
          component: "Button",
          minWidth: 44,
          minHeight: 44,
          "aria-label": str,
        },
        children: str,
      });
    case "Label":
      return node({
        type: "component",
        props: { component: "Label" },
        children: str,
      });
    case "Input":
      return node({
        type: "component",
        props: {
          component: "Input",
          minWidth: 44,
          minHeight: 44,
          "aria-label": str,
          componentProps: { placeholder: str ? undefined : "Enter..." },
        },
        children: undefined,
      });
    default:
      return node({
        type: "component",
        props: { component: comp },
        children: typeof value === "object" && value !== null && !Array.isArray(value) ? value : str,
      });
  }
}

/** One patch operation as the LLM may output: path-based OR semantic. */
export interface PatchOperationFromLLM {
  op: "add" | "remove" | "replace";
  /** Path-based: use this path (must exist or parent exist). */
  path?: string;
  /** Semantic: target by id or { componentType }. */
  target?: SemanticTarget;
  /** For add: "append" (default) or "prepend". */
  position?: "append" | "prepend";
  /** For replace with target: property path relative to node, e.g. "props/style". */
  subpath?: string;
  value?: any;
  from?: string;
  /** For add with count: component type (e.g. "Card", "Button"); runtime builds N nodes. */
  component?: string;
  /** For add: number of items; runtime expands to N add ops (do not repeat path). */
  count?: number;
  /** For add with count: labels/titles per item; length must equal count. */
  values?: any[];
}

export interface ConvertSemanticResult {
  /** Resolved JSON Patch operations (all path-based). */
  patches: Patch;
  /** If resolution failed: message and list of target ids to suggest in retry. */
  resolutionError?: {
    message: string;
    allowedTargets: string[];
    /** Index in the original patches array that failed. */
    failedIndex: number;
  };
}

/**
 * Convert mixed semantic + path-based patches to pure JSON Patch.
 * - If a patch has "target" (and no "path"): resolve target to path, then build op.
 * - If a patch has "path": use as-is (path-based).
 * When any semantic target fails to resolve, returns resolutionError with allowedTargets.
 */
export function convertSemanticPatchesToJsonPatch(
  ui: LayoutNode,
  rawPatches: PatchOperationFromLLM[]
): ConvertSemanticResult {
  const targets = getAddressableTargets(ui);
  const allowedTargetIds = targets.map((t) => t.id);
  const result: Patch = [];

  for (let i = 0; i < rawPatches.length; i++) {
    const raw = rawPatches[i];
    if (!raw || typeof raw !== "object" || !raw.op) continue;

    const op = raw.op as "add" | "remove" | "replace";

    if (raw.target != null && (raw.path == null || raw.path === "")) {
      // Semantic patch
      const resolvedPath = resolveTarget(raw.target, targets, {
        forAdd: op === "add",
      });
      if (resolvedPath == null) {
        const targetStr =
          typeof raw.target === "string"
            ? raw.target
            : (raw.target as any)?.componentType ?? "unknown";
        return {
          patches: [],
          resolutionError: {
            message: `Target "${targetStr}" could not be resolved. Use one of the allowed target ids.`,
            allowedTargets: allowedTargetIds,
            failedIndex: i,
          },
        };
      }

      if (op === "add") {
        const position = raw.position === "prepend" ? "prepend" : "append";
        const addPath =
          position === "prepend" ? getPrependPath(resolvedPath) : getAppendPath(resolvedPath);

        const count = raw.count != null ? Number(raw.count) : undefined;
        const values = Array.isArray(raw.values) ? raw.values : undefined;
        const component = raw.component != null ? String(raw.component) : undefined;

        if (count != null && count >= 1) {
          if (!Number.isInteger(count) || count < 1) {
            return {
              patches: [],
              resolutionError: {
                message: `Semantic "add" with "count" requires a positive integer.`,
                allowedTargets: allowedTargetIds,
                failedIndex: i,
              },
            };
          }
          if (values == null || values.length !== count) {
            return {
              patches: [],
              resolutionError: {
                message: `When using "count": ${count}, "values" must be an array of length ${count}. Got length ${values?.length ?? 0}.`,
                allowedTargets: allowedTargetIds,
                failedIndex: i,
              },
            };
          }
          const comp = component || "Card";
          for (let j = 0; j < count; j++) {
            const node = buildNodeFromComponentAndValue(comp, values[j]);
            result.push({ op: "add", path: addPath, value: node });
          }
          continue;
        }

        if (raw.value === undefined && !(values?.length === 1 && component)) {
          return {
            patches: [],
            resolutionError: {
              message: `Semantic "add" patch requires "value" (the node to add) or "count" + "values" + "component".`,
              allowedTargets: allowedTargetIds,
              failedIndex: i,
            },
          };
        }
        const valueToAdd =
          raw.value !== undefined
            ? raw.value
            : values?.length === 1 && component
              ? buildNodeFromComponentAndValue(component, values[0])
              : raw.value;
        result.push({ op: "add", path: addPath, value: valueToAdd });
      } else if (op === "remove") {
        result.push({ op: "remove", path: resolvedPath });
      } else if (op === "replace") {
        const subpath = raw.subpath ?? "props";
        const fullPath = resolvedPath.replace(/\/$/, "") + "/" + subpath.replace(/^\//, "");
        if (raw.value === undefined) {
          return {
            patches: [],
            resolutionError: {
              message: `Semantic "replace" patch requires "value".`,
              allowedTargets: allowedTargetIds,
              failedIndex: i,
            },
          };
        }
        result.push({ op: "replace", path: fullPath, value: raw.value });
      }
    } else {
      // Path-based patch (legacy): use path as-is
      const path = raw.path;
      if (!path || path === "") {
        return {
          patches: [],
          resolutionError: {
            message: `Patch at index ${i} has no "path" and no "target". Use "target" with an allowed target id to avoid invalid paths.`,
            allowedTargets: allowedTargetIds,
            failedIndex: i,
          },
        };
      }
      const patchOp: PatchOperation = { op, path };
      if (raw.value !== undefined) patchOp.value = raw.value;
      if (raw.from !== undefined) patchOp.from = raw.from;
      result.push(patchOp);
    }
  }

  return { patches: result };
}

/**
 * Normalize parsed LLM response patches into PatchOperationFromLLM[].
 * Accepts both strict JSON Patch (op, path, value) and semantic (op, target, position, value).
 */
export function normalizeParsedPatches(parsed: any[]): PatchOperationFromLLM[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.map((p) => {
    if (!p || typeof p !== "object") return p;
    const op = p.op;
    const path = p.path != null ? String(p.path).trim() : undefined;
    const target = p.target;
    const position = p.position === "prepend" ? "prepend" : "append";
    const subpath = p.subpath != null ? String(p.subpath) : undefined;
    const value = p.value;
    const from = p.from;
    const rawCount = p.count != null ? Number(p.count) : undefined;
    const count =
      rawCount != null && rawCount >= 1 ? Math.floor(rawCount) : undefined;
    const values = Array.isArray(p.values) ? p.values : undefined;
    const component = p.component != null ? String(p.component) : undefined;
    return {
      op,
      path: path || undefined,
      target,
      position: op === "add" ? position : undefined,
      subpath,
      value,
      from,
      count,
      values,
      component,
    } as PatchOperationFromLLM;
  });
}
