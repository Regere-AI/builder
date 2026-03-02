/**
 * Planner Activation Heuristic
 *
 * Decides when to route a request through the planner/executor
 * pipeline based on the size/complexity of the user's prompt.
 *
 * Current rule:
 * - Treat a prompt as "big" when it contains at least two
 *   sentences/phrases.
 *
 * Sentences/phrases are split on:
 * - Sentence delimiters: `.`, `!`, `?`
 * - Strong separators: `;`, newlines
 */

/**
 * Normalize whitespace to make sentence splitting more reliable.
 */
function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

/**
 * Count sentence / phrase segments in the prompt.
 *
 * We split on:
 * - `.`, `!`, `?`
 * - `;`
 * - Newlines
 *
 * Then count non-empty segments that contain at least one
 * alphanumeric character.
 */
function countPromptSegments(prompt: string): number {
  const normalized = normalizeWhitespace(prompt);

  if (!normalized) {
    return 0;
  }

  const rawSegments = normalized.split(/[.!?;]+|\n+/g);

  const segments = rawSegments
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && /[a-zA-Z0-9]/.test(segment));

  return segments.length;
}

/**
 * Decide whether to activate the planner for a given prompt.
 *
 * - Returns true when the prompt has at least two sentences/phrases.
 * - Returns false for very short, single-phrase prompts.
 */
export function shouldUsePlanner(prompt: string): boolean {
  const segments = countPromptSegments(prompt);
  return segments >= 2;
}

