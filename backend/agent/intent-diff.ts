/**
 * Heuristic diff between user prompt intent and generated UI.
 * Catches big mismatches (e.g. "3 buttons" but only 2, "horizontal" but column layout).
 * Soft check: use to warn or trigger retry; not a strict gate.
 */

import type { LayoutNode } from "../../shared/schema";

export interface IntentDiffResult {
  ok: boolean;
  reason?: string;
}

/** Count components by type in the tree (props.component or props.componentName) */
function countComponents(node: any, componentName: string): number {
  if (!node || typeof node !== "object") return 0;
  let n = 0;
  if (node.type === "component") {
    const comp = node.props?.component ?? node.props?.componentName;
    if (comp === componentName) n++;
  }
  if (Array.isArray(node.children)) {
    for (const c of node.children) {
      if (typeof c === "object" && c !== null) n += countComponents(c, componentName);
    }
  }
  return n;
}

/** Get root layout direction (flex row/column) from root or first child */
function getRootDirection(node: any): "row" | "column" | null {
  if (!node || typeof node !== "object") return null;
  if (node.type === "flex" && node.props?.direction) {
    return node.props.direction === "row" ? "row" : node.props.direction === "column" ? "column" : null;
  }
  if (Array.isArray(node.children) && node.children.length > 0) {
    const first = node.children[0];
    if (first && typeof first === "object") return getRootDirection(first);
  }
  return null;
}

/** Check if UI contains a sidebar-like structure (SidebarLayout or nav column at root) */
function hasSidebar(node: any): boolean {
  if (!node || typeof node !== "object") return false;
  if (node.type === "component") {
    const comp = node.props?.component ?? node.props?.componentName;
    if (comp === "SidebarLayout" || comp === "SideNavigation") return true;
  }
  if (Array.isArray(node.children)) {
    for (const c of node.children) {
      if (typeof c === "object" && c !== null && hasSidebar(c)) return true;
    }
  }
  return false;
}

/**
 * Heuristic: compare user prompt intent to generated UI.
 * Returns { ok: true } or { ok: false, reason } for big mismatches.
 */
export function diffIntentVsUI(userPrompt: string, ui: LayoutNode): IntentDiffResult {
  const prompt = (userPrompt || "").toLowerCase();

  // "N buttons" -> exactly N Button components
  const buttonsMatch = prompt.match(/(\d+)\s*buttons?/);
  if (buttonsMatch) {
    const expected = parseInt(buttonsMatch[1], 10);
    const actual = countComponents(ui, "Button");
    if (actual !== expected) {
      return { ok: false, reason: `Prompt asks for ${expected} button(s) but UI has ${actual} Button component(s).` };
    }
  }

  // "N cards" / "N plans" / "N input fields" / "N inputs"
  const cardsMatch = prompt.match(/(\d+)\s*(?:cards?|plans?|tiers?|pricing\s*plans?)/);
  if (cardsMatch) {
    const expected = parseInt(cardsMatch[1], 10);
    const actual = countComponents(ui, "Card");
    if (actual !== expected) {
      return { ok: false, reason: `Prompt asks for ${expected} card/plan(s) but UI has ${actual} Card component(s).` };
    }
  }

  // "3 plans: Basic, Pro, Enterprise" or "Basic $9, Pro $29, Enterprise $99" → expect 3 cards
  const plansListMatch = prompt.match(/(?:(\d+)\s*plans?\s*[:\-]|basic\s*[,$]|basic\s*\$\d+).*(?:pro\s*[,$]|pro\s*\$\d+).*(?:enterprise|enterprise\s*\$\d+)/i);
  if (plansListMatch) {
    const expected = plansListMatch[1] ? parseInt(plansListMatch[1], 10) : 3;
    const actual = countComponents(ui, "Card");
    if (actual < expected) {
      return { ok: false, reason: `Prompt lists ${expected} plans (e.g. Basic, Pro, Enterprise) but UI has ${actual} Card component(s). Add all ${expected} plan cards.` };
    }
  }

  const inputsMatch = prompt.match(/(\d+)\s*(?:input\s*fields?|inputs?)/);
  if (inputsMatch) {
    const expected = parseInt(inputsMatch[1], 10);
    const actual = countComponents(ui, "Input");
    if (actual !== expected) {
      return { ok: false, reason: `Prompt asks for ${expected} input(s) but UI has ${actual} Input component(s).` };
    }
  }

  // "horizontal" / "side by side" / "row" -> root (or first flex) should be row
  if (/\b(horizontal|side\s*by\s*side|in\s*a\s*row|row\s*layout)\b/.test(prompt)) {
    const dir = getRootDirection(ui);
    if (dir !== null && dir !== "row") {
      return { ok: false, reason: `Prompt asks for horizontal/row layout but root direction is "${dir}".` };
    }
  }

  // "vertical" / "stacked" / "column" -> root should be column
  if (/\b(vertical|stacked|one\s*below|column\s*layout)\b/.test(prompt)) {
    const dir = getRootDirection(ui);
    if (dir !== null && dir !== "column") {
      return { ok: false, reason: `Prompt asks for vertical/column layout but root direction is "${dir}".` };
    }
  }

  // "no sidebar" / "without sidebar" -> must not contain sidebar
  if (/\b(no\s+sidebar|without\s+(a\s+)?sidebar)\b/.test(prompt)) {
    if (hasSidebar(ui)) {
      return { ok: false, reason: "Prompt says no sidebar but UI contains a sidebar or side navigation." };
    }
  }

  return { ok: true };
}
