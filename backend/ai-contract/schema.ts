import { z } from "zod";
import { LayoutNodeSchema } from "../../shared/schema";

/**
 * Zod schema for AIResponseIntent
 */
export const AIResponseIntentSchema = z.enum(["create", "modify"]);

/**
 * Canonical Zod schema for AI response validation.
 * All AI-generated outputs must pass this validation.
 */
export const AIResponseSchema = z.object({
  intent: AIResponseIntentSchema,
  ui: LayoutNodeSchema,
  explanation: z.string().min(1, "Explanation must be a non-empty string"),
});

/**
 * Type inferred from the Zod schema
 */
export type AIResponseParsed = z.infer<typeof AIResponseSchema>;

