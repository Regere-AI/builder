/**
 * State Types
 * 
 * Type definitions for UI state management
 */

import type { LayoutNode } from "../../shared/schema";

/**
 * UI State Version Structure
 * Phase 4, Step 4.3: Each version stores snapshot, timestamp, action, and user instruction
 */
export interface UIStateVersion {
  versionId: string;
  ui: LayoutNode;
  timestamp: Date;
  action: "create" | "modify";
  userInstruction: string;
}
