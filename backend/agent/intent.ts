/**
 * Intent Classification
 * 
 * Detects user intent before execution:
 * - create: Build new UI from scratch
 * - modify: Change existing UI
 * 
 * This is rule-based classification (no LLM yet).
 * It's stateless, pure, and deterministic.
 */

/**
 * User intent types
 */
export type Intent = "create" | "modify" | "add" | "remove";

/**
 * Keywords that strongly indicate create intent
 * Note: Longer phrases are checked first to avoid false matches
 */
const CREATE_KEYWORDS = [
  "create a",
  "build a",
  "make a",
  "design a",
  "generate a",
  "add a new", // "add a new section" = create
  "create",
  "build",
  "design",
  "generate",
  "new",
];

/**
 * Keywords that indicate modify intent
 * Note: "add" and "add a" are here for "add field" (modify), not "add a new" (create)
 * Note: Improve-related keywords (improve, refactor, optimize, etc.) are also treated as modify
 */
const MODIFY_KEYWORDS = [
  "change",
  "update",
  "edit",
  "replace",
  "remove",
  "delete",
  "add a", // "add a field" = modify (when UI exists)
  "add",
  "reorder",
  "move",
  "swap",
  "set",
  "modify",
  "adjust",
  "alter",
  "make it", // "make it blue" = modify, not create
  // Improve-related keywords (remapped to modify)
  "improve",
  "refactor",
  "optimize",
  "clean up",
  "enhance",
  "better",
  "polish",
  "refine",
  "restructure",
  "reorganize",
  "simplify",
  "modernize",
];

/** Add a complete UI component at a specific place */
const ADD_KEYWORDS = [
  "add a",
  "add an",
  "insert a",
  "insert an",
  "add at",
  "insert at",
  "add to the",
  "insert at the",
];

/** Remove an entire component from a specific place */
const REMOVE_KEYWORDS = [
  "remove the",
  "remove a",
  "remove an",
  "delete the",
  "delete a",
  "delete an",
  "remove from",
  "delete from",
];

/**
 * Classify user intent from prompt
 * 
 * Rule-based intent classification
 * 
 * Rules:
 * 1. If no existing UI → always "create"
 * 2. If create keywords found (especially "create", "build", "make", "design") → "create" (even with existing UI)
 * 3. If modify keywords found → "modify" (includes improve-related keywords)
 * 4. Default: "modify" if UI exists, "create" if not
 * 
 * IMPORTANT: "Create X" should ALWAYS be create intent, even if UI exists.
 * The user is explicitly asking to create something new, not modify existing UI.
 * 
 * @param userPrompt - The user's natural language prompt
 * @param hasExistingUI - Whether there's an existing UI in state
 * @returns Detected intent
 */
export function classifyIntent(
  userPrompt: string,
  hasExistingUI: boolean
): Intent {
  const prompt = userPrompt.toLowerCase().trim();

  // Rule 1: No existing UI → always create
  if (!hasExistingUI) {
    return "create";
  }

  // Rule 2: Check for STRONG create keywords first (before modify keywords)
  // These indicate the user wants to create something NEW, not modify existing
  const strongCreateKeywords = [
    "create a",
    "create 2",
    "create 3",
    "create 4",
    "create 5",
    "create new",
    "build a",
    "build 2",
    "build 3",
    "make a",
    "make 2",
    "make 3",
    "design a",
    "design 2",
    "design 3",
    "generate a",
    "generate 2",
    "generate 3",
    "add a new",
  ];

  // Check for strong create keywords (with numbers or "a/new")
  if (strongCreateKeywords.some((keyword) => prompt.includes(keyword))) {
    return "create";
  }

  // Check for standalone "create" at the start of the prompt
  if (prompt.startsWith("create ") || prompt.startsWith("build ") || 
      prompt.startsWith("make ") || prompt.startsWith("design ") ||
      prompt.startsWith("generate ")) {
    return "create";
  }

  // Rule 3: Check for remove (when UI exists)
  if (REMOVE_KEYWORDS.some((keyword) => prompt.includes(keyword))) {
    return "remove";
  }

  // Rule 4: Check for modify keywords before add keywords.
  // "Add a header", "add a button", "add a field" = modify existing UI (patch to add); same execution path as modify.
  if (MODIFY_KEYWORDS.some((keyword) => prompt.includes(keyword))) {
    return "modify";
  }

  // Rule 5: Add-specific phrasing that didn't match modify (e.g. "insert at the top", "add to the sidebar")
  if (ADD_KEYWORDS.some((keyword) => prompt.includes(keyword))) {
    return "add";
  }

  // Rule 6: Default fallback
  // If UI exists but no clear keywords, assume modify
  // If no UI exists, assume create (though this shouldn't happen due to Rule 1)
  return hasExistingUI ? "modify" : "create";
}
