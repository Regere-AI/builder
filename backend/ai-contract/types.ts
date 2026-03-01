import type { LayoutNode } from "../../shared/schema";

/**
 * Intent of the AI response.
 * - "create": Generate a new UI layout from scratch
 * - "modify": Modify an existing UI layout
 */
export type AIResponseIntent = "create" | "modify";

/**
 * Canonical AI response contract.
 * All AI-generated outputs must conform to this structure.
 * 
 * Note: The runtime type is inferred from AIResponseSchema in schema.ts
 */
export interface AIResponse {
  /** Intent of the response: create new UI or modify existing */
  intent: AIResponseIntent;
  
  /** The UI layout node, validated using LayoutNodeSchema */
  ui: LayoutNode;
  
  /** Human-readable explanation of the generated UI */
  explanation: string;
}

