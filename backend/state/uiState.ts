/**
 * UI State Management with Versioning
 * 
 * Single source of truth for the currently generated UI JSON with version history.
 * This state is used across CREATE and MODIFY operations to maintain
 * UI persistence and enable iterative modifications.
 * 
 * UI State Management and Versioning / History
 */

import type { LayoutNode } from "../../shared/schema";
import type { UIStateVersion } from "./types";

/**
 * Ensures root UI object has only type, props, children (no buttons, cards, alerts, etc.).
 * Called before every state commit so prompts/regressions cannot leak extra keys.
 */
function assertRootOnlyHasTypePropsChildren(ui: any): void {
  if (ui == null || typeof ui !== "object") return;
  const keys = Object.keys(ui);
  const allowed = new Set(["type", "props", "children"]);
  const extra = keys.filter((k) => !allowed.has(k));
  if (extra.length > 0) {
    throw new Error(`Root has invalid top-level keys: ${extra.join(", ")}`);
  }
}

/**
 * Application state for UI JSON with version history
 */
class UIState {
  // History array stores all versions
  private history: UIStateVersion[] = [];
  private currentVersionIndex: number = -1;

  /**
   * Get the current UI JSON (latest version)
   * Phase 4, Step 4.3: Returns UI from currentVersion
   * @returns The current UI JSON or null if no UI has been generated
   */
  getCurrentUI(): LayoutNode | null {
    if (this.currentVersionIndex < 0 || this.currentVersionIndex >= this.history.length) {
      return null;
    }
    return this.history[this.currentVersionIndex].ui;
  }

  /**
   * Get the current version metadata
   * @returns The current version or null if no version exists
   */
  getCurrentVersion(): UIStateVersion | null {
    if (this.currentVersionIndex < 0 || this.currentVersionIndex >= this.history.length) {
      return null;
    }
    return this.history[this.currentVersionIndex];
  }

  /**
   * Set the current UI JSON
   * Phase 4, Step 4.3: Append new version instead of replacing
   * @param ui - The LayoutNode to store as new version
   * @param action - The action that created this UI ("create" or "modify")
   * @param userInstruction - The user prompt/instruction that generated this UI
   */
  setCurrentUI(ui: LayoutNode, action: "create" | "modify", userInstruction: string): void {
    assertRootOnlyHasTypePropsChildren(ui);
    // Phase 4, Step 4.3: Create new version snapshot
    const version: UIStateVersion = {
      versionId: `v${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ui,
      timestamp: new Date(),
      action,
      userInstruction,
    };

    // Phase 4, Step 4.3: Push new version into history array
    this.history.push(version);
    this.currentVersionIndex = this.history.length - 1;
  }

  /**
   * Get previous UI version
   * Phase 4, Step 4.3: Helper to access previous version
   * @returns The previous UI JSON or null if no previous version exists
   */
  getPreviousUI(): LayoutNode | null {
    if (this.currentVersionIndex <= 0 || this.history.length === 0) {
      return null;
    }
    return this.history[this.currentVersionIndex - 1].ui;
  }

  /**
   * Get previous version metadata
   * @returns The previous version or null if no previous version exists
   */
  getPreviousVersion(): UIStateVersion | null {
    if (this.currentVersionIndex <= 0 || this.history.length === 0) {
      return null;
    }
    return this.history[this.currentVersionIndex - 1];
  }

  /**
   * Rollback to a specific version
   * Phase 4, Step 4.3: Restore exact prior UI
   * @param versionId - The version ID to rollback to
   * @returns true if rollback was successful, false if version not found
   */
  rollbackTo(versionId: string): boolean {
    const versionIndex = this.history.findIndex((v) => v.versionId === versionId);
    if (versionIndex === -1) {
      return false;
    }

    // Phase 4, Step 4.3: Set currentVersionIndex to the rolled-back version
    this.currentVersionIndex = versionIndex;
    return true;
  }

  /**
   * Get all version history
   * @returns Array of all versions
   */
  getHistory(): UIStateVersion[] {
    return [...this.history];
  }

  /**
   * Get version by ID
   * @param versionId - The version ID to retrieve
   * @returns The version or null if not found
   */
  getVersion(versionId: string): UIStateVersion | null {
    const version = this.history.find((v) => v.versionId === versionId);
    return version || null;
  }

  /**
   * Clear/reset the current UI state and history
   */
  clearCurrentUI(): void {
    this.history = [];
    this.currentVersionIndex = -1;
  }

  /**
   * Check if there is a current UI stored
   * @returns true if a UI is stored, false otherwise
   */
  hasCurrentUI(): boolean {
    return this.currentVersionIndex >= 0 && this.currentVersionIndex < this.history.length;
  }

  /**
   * Get version count
   * @returns Number of versions in history
   */
  getVersionCount(): number {
    return this.history.length;
  }

  /**
   * Compare two versions and return differences
   * Phase 4, Step 4.3: Diff/debug support for comparing versions
   * @param versionId1 - First version ID (or null for current)
   * @param versionId2 - Second version ID (or null for current)
   * @returns Object with differences or null if versions not found
   */
  compareVersions(versionId1: string | null, versionId2: string | null): {
    version1: UIStateVersion | null;
    version2: UIStateVersion | null;
    uiDiff: boolean;
    ui1String: string;
    ui2String: string;
  } | null {
    const v1 = versionId1
      ? this.getVersion(versionId1)
      : this.getCurrentVersion();
    const v2 = versionId2
      ? this.getVersion(versionId2)
      : this.getCurrentVersion();

    if (!v1 || !v2) {
      return null;
    }

    const ui1String = JSON.stringify(v1.ui, null, 2);
    const ui2String = JSON.stringify(v2.ui, null, 2);
    const uiDiff = ui1String !== ui2String;

    return {
      version1: v1,
      version2: v2,
      uiDiff,
      ui1String,
      ui2String,
    };
  }
}

// Singleton instance - single source of truth
export const uiState = new UIState();
