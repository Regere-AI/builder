/**
 * JSON Patch Schema (RFC 6902)
 * 
 * Defines the schema for JSON Patch operations used in patch-based modify flow.
 * A patch is an array of operations that can be applied to a JSON document.
 */

import { z } from "zod";

/**
 * JSON Patch operation types (RFC 6902)
 */
export const PatchOperationSchema = z.object({
  /** Operation type: add, remove, replace, move, copy, test */
  op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
  /** JSON Pointer path to the target location */
  path: z.string().min(1, "Path must be a non-empty string"),
  /** Value to add/replace (required for add, replace, test) */
  value: z.any().optional(),
  /** Source path (required for move, copy) */
  from: z.string().optional(),
});

/**
 * JSON Patch document - array of operations (empty array = no-op, keep current UI)
 */
export const PatchSchema = z.array(PatchOperationSchema);

/**
 * Type inferred from PatchSchema
 */
export type PatchOperation = z.infer<typeof PatchOperationSchema>;
export type Patch = z.infer<typeof PatchSchema>;

/**
 * Patch response from LLM
 * The LLM should output a JSON object with a "patches" array
 */
export const PatchResponseSchema = z.object({
  /** Array of patch operations */
  patches: PatchSchema,
  /** Human-readable explanation of the changes */
  explanation: z.string().min(1, "Explanation must be a non-empty string"),
});

/**
 * Type inferred from PatchResponseSchema
 */
export type PatchResponse = z.infer<typeof PatchResponseSchema>;

/**
 * Unfulfillable response from LLM
 * When the request cannot be fulfilled (e.g. referenced element/label does not exist),
 * the LLM may output this instead of patches.
 */
export const UnfulfillableResponseSchema = z.object({
  unfulfillable: z.literal(true),
  reason: z.string().min(1, "Reason must be a non-empty string"),
});

export type UnfulfillableResponse = z.infer<typeof UnfulfillableResponseSchema>;

/**
 * Type guard: parsed JSON is an unfulfillable response
 */
export function isUnfulfillableResponse(parsed: unknown): parsed is UnfulfillableResponse {
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    (parsed as any).unfulfillable === true &&
    typeof (parsed as any).reason === "string" &&
    (parsed as any).reason.trim().length > 0
  );
}

/**
 * Relaxed patch operation — LLM may output "path" (path-based) OR "target" (semantic).
 * For "add" with N items: use count + values (runtime expands to N add ops); do not repeat the same path.
 */
export const RelaxedPatchOperationSchema = z
  .object({
    op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
    path: z.string().optional(),
    target: z.union([z.string(), z.object({ componentType: z.string() })]).optional(),
    position: z.enum(["append", "prepend"]).optional(),
    subpath: z.string().optional(),
    value: z.any().optional(),
    from: z.string().optional(),
    /** For add: component type when expanding count (e.g. "Card", "Button"). */
    component: z.string().optional(),
    /** For add: number of items to add; runtime expands to N separate add ops. */
    count: z.number().int().min(1).optional(),
    /** For add with count: array of labels/titles (one per item); length must equal count. */
    values: z.array(z.any()).optional(),
  })
  .refine((data) => (data as any).path != null || (data as any).target != null, {
    message: "Either path or target is required",
  });

export const RelaxedPatchResponseSchema = z.object({
  patches: z.array(RelaxedPatchOperationSchema),
  explanation: z.string().min(1, "Explanation must be a non-empty string"),
});

export type RelaxedPatchResponse = z.infer<typeof RelaxedPatchResponseSchema>;
