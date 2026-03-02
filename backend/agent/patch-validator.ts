/**
 * Patch Validator
 * 
 * Validates JSON Patch operations before they are applied to the UI.
 * Ensures patches are well-formed and paths are valid.
 */

import {
  PatchResponseSchema,
  RelaxedPatchResponseSchema,
  type PatchResponse,
  type PatchOperation,
  type RelaxedPatchResponse,
  isUnfulfillableResponse,
} from "./patch-schema";
import type { LayoutNode } from "../../shared/schema";
import { validateLayoutNodeDirect } from "./validator";

/**
 * Validation result for patch operations
 */
export interface PatchValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Parsed patch response (only present if valid, not unfulfillable, and not fullUI) */
  parsedResponse?: PatchResponse;
  /** When the model returned full UI JSON instead of patches, use this as the result */
  fullUI?: LayoutNode;
  /** Validation errors (only present if invalid) */
  errors?: string[];
  /** Raw parsed JSON before validation (for debugging) */
  rawParsed?: any;
  /** True when LLM returned unfulfillable (request cannot be fulfilled) */
  unfulfillable?: boolean;
  /** User-facing reason when unfulfillable */
  unfulfillableReason?: string;
  /** True when response used relaxed schema (patches may have target instead of path; executor must convert) */
  semanticPatches?: boolean;
}

/**
 * Validates that a path exists in the target object
 * Uses JSON Pointer path resolution
 */
function validatePathExists(obj: any, path: string): boolean {
  const parts = path.split("/").filter((p) => p !== "");
  
  let current = obj;
  for (const part of parts) {
    // Handle array indices
    if (Array.isArray(current)) {
      const index = parseInt(part, 10);
      if (isNaN(index) || index < 0 || index >= current.length) {
        return false;
      }
      current = current[index];
    } else if (current && typeof current === "object") {
      if (!(part in current)) {
        return false;
      }
      current = current[part];
    } else {
      return false;
    }
  }
  
  return true;
}

/**
 * Validates that the parent of the path exists (so we can add or replace the final segment).
 * e.g. "/children/0/children/2/props/minWidth" → parent is "/children/0/children/2/props"
 */
function validateParentPathExists(obj: any, path: string): boolean {
  const parts = path.split("/").filter((p) => p !== "");
  if (parts.length === 0) return true; // path is "/", parent is root
  const parentPath = "/" + parts.slice(0, -1).join("/");
  return validatePathExists(obj, parentPath);
}

/**
 * Returns true if any prefix of the path exists (e.g. /children, /children/3, /children/3/children).
 * Allows replace when we can "anchor" to an existing node and the applier will ensure the rest.
 */
function validateAnyAncestorPathExists(obj: any, path: string): boolean {
  const parts = path.split("/").filter((p) => p !== "");
  for (let len = 1; len <= parts.length; len++) {
    const prefix = "/" + parts.slice(0, len).join("/");
    if (validatePathExists(obj, prefix)) return true;
  }
  return false;
}

/**
 * Validates patch operations against the target UI
 * 
 * @param patches - Array of patch operations to validate
 * @param targetUI - The UI that patches will be applied to
 * @returns Validation result with errors if any
 */
function validatePatchOperations(
  patches: PatchOperation[],
  targetUI: LayoutNode
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i];
    const { op, path, value, from } = patch;

    // Validate path format (must start with /)
    if (!path.startsWith("/")) {
      errors.push(`Patch ${i}: Path must start with "/" (got: "${path}")`);
      continue;
    }

    // Validate operation-specific requirements
    switch (op) {
      case "replace":
        if (value === undefined) {
          errors.push(`Patch ${i}: "replace" operation requires "value" field`);
        } else {
          const parentPath = "/" + path.split("/").filter((p) => p !== "").slice(0, -1).join("/");
          const allow =
            validatePathExists(targetUI, path) ||
            validateParentPathExists(targetUI, path) ||
            (parentPath.length > 1 && validateAnyAncestorPathExists(targetUI, parentPath));
          if (!allow) {
            errors.push(`Patch ${i}: Path does not exist for "replace" operation: "${path}"`);
          }
        }
        break;

      case "add":
        if (value === undefined) {
          errors.push(`Patch ${i}: "add" operation requires "value" field`);
        }
        // Add with "/-" can target any depth; parent path may not exist yet (e.g. empty container).
        // Applier creates missing path segments (placeholder nodes) at any nesting level — no strict path check here.
        break;

      case "remove":
        // Check if path exists (remove requires existing path)
        if (!validatePathExists(targetUI, path)) {
          errors.push(`Patch ${i}: Path does not exist for "remove" operation: "${path}"`);
        }
        break;

      case "move":
      case "copy":
        if (!from) {
          errors.push(`Patch ${i}: "${op}" operation requires "from" field`);
        } else if (!from.startsWith("/")) {
          errors.push(`Patch ${i}: "from" path must start with "/" (got: "${from}")`);
        } else if (!validatePathExists(targetUI, from)) {
          errors.push(`Patch ${i}: Source path does not exist for "${op}" operation: "${from}"`);
        }
        break;

      case "test":
        if (value === undefined) {
          errors.push(`Patch ${i}: "test" operation requires "value" field`);
        } else if (!validatePathExists(targetUI, path)) {
          errors.push(`Patch ${i}: Path does not exist for "test" operation: "${path}"`);
        }
        break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Parse JSON from raw string response
 */
function parseJSON(rawResponse: string): { success: boolean; parsed?: any; error?: string } {
  try {
    // Try to extract JSON from response (handles cases where model adds extra text)
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return {
        success: true,
        parsed: JSON.parse(jsonMatch[0]),
      };
    } else {
      // Try parsing the entire response
      return {
        success: true,
        parsed: JSON.parse(rawResponse),
      };
    }
  } catch (parseError) {
    return {
      success: false,
      error: parseError instanceof Error ? parseError.message : String(parseError),
    };
  }
}

/** Options for validatePatchResponse */
export interface ValidatePatchResponseOptions {
  /** When true, do not accept full UI as fallback; only valid patch response is accepted (use for plan-step execution) */
  rejectFullUI?: boolean;
}

/**
 * Validates patch response from LLM
 * 
 * @param rawResponse - Raw string response from LLM
 * @param targetUI - The UI that patches will be applied to
 * @param options - Optional: rejectFullUI (for plan steps, only accept patches)
 * @returns PatchValidationResult with valid flag and parsed response or errors
 */
export function validatePatchResponse(
  rawResponse: string,
  targetUI: LayoutNode,
  options?: ValidatePatchResponseOptions
): PatchValidationResult {
  const rejectFullUI = options?.rejectFullUI === true;
  // Step 1: Parse JSON (fail fast if invalid)
  const parseResult = parseJSON(rawResponse);
  if (!parseResult.success) {
    return {
      valid: false,
      errors: [`Failed to parse JSON response: ${parseResult.error}`],
      rawParsed: undefined,
    };
  }

  const parsedResponse = parseResult.parsed!;

  // Step 2: If unfulfillable, return dedicated result (no patches to apply)
  if (isUnfulfillableResponse(parsedResponse)) {
    return {
      valid: true,
      unfulfillable: true,
      unfulfillableReason: parsedResponse.reason.trim(),
      rawParsed: parsedResponse,
    };
  }

  // Step 3: Validate against PatchResponseSchema (strict) or RelaxedPatchResponseSchema (semantic)
  let patchResponse: PatchResponse | RelaxedPatchResponse;
  let semanticPatches = false;
  try {
    patchResponse = PatchResponseSchema.parse(parsedResponse) as PatchResponse;
  } catch {
    try {
      patchResponse = RelaxedPatchResponseSchema.parse(parsedResponse) as RelaxedPatchResponse;
      semanticPatches = true;
    } catch (relaxedError: any) {
      // Fallback: some models return full UI JSON instead of patches — only accept when rejectFullUI is false
      if (rejectFullUI) {
        return {
          valid: false,
          errors: [
            "This step requires JSON Patch output only. The model returned a full UI layout instead of patches. Output must be: {\"patches\": [...], \"explanation\": \"...\"}. For add/remove use \"target\" (e.g. target: \"root\" or target: {\"componentType\": \"flex\"}) and \"position\": \"append\", not raw paths with indices.",
          ],
          rawParsed: parsedResponse,
        };
      }
      let candidateUI: unknown = null;
      if (parsedResponse && typeof parsedResponse === "object") {
        if ("type" in parsedResponse && typeof (parsedResponse as any).type === "string") {
          candidateUI = parsedResponse;
        } else if ("ui" in parsedResponse && (parsedResponse as any).ui && typeof (parsedResponse as any).ui === "object") {
          candidateUI = (parsedResponse as any).ui;
        } else if ("layout" in parsedResponse && (parsedResponse as any).layout && typeof (parsedResponse as any).layout === "object") {
          candidateUI = (parsedResponse as any).layout;
        }
      }
      if (candidateUI && typeof candidateUI === "object" && "type" in candidateUI && typeof (candidateUI as any).type === "string") {
        const layoutValidation = validateLayoutNodeDirect(candidateUI as LayoutNode);
        if (layoutValidation.valid) {
          return {
            valid: true,
            fullUI: candidateUI as LayoutNode,
            rawParsed: parsedResponse,
          };
        }
      }
      return {
        valid: false,
        errors: [`Patch response validation failed: ${relaxedError.message || String(relaxedError)}`],
        rawParsed: parsedResponse,
      };
    }
  }

  // Step 4: If strict path-based patches, validate paths against target UI
  if (!semanticPatches) {
    const patchValidation = validatePatchOperations((patchResponse as PatchResponse).patches, targetUI);
    if (!patchValidation.valid) {
      return {
        valid: false,
        errors: patchValidation.errors,
        rawParsed: parsedResponse,
      };
    }
  }

  // Validation passed (path-based or semantic; executor will convert semantic to paths)
  return {
    valid: true,
    parsedResponse: patchResponse as PatchResponse,
    semanticPatches,
  };
}
