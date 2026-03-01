/**
 * In-memory cache for planner output. Same goal + UI summary → same plan (skip planner LLM call).
 */

import type { RawPlan } from "./plan-order";

interface CacheEntry {
  plan: RawPlan;
  createdAt: number;
}

const MAX_SIZE = 100;
const TTL_MS = 5 * 60 * 1000; // 5 minutes

const cache = new Map<string, CacheEntry>();
const keyOrder: string[] = [];

function evictOldest(): void {
  if (keyOrder.length === 0) return;
  const oldest = keyOrder.shift()!;
  cache.delete(oldest);
}

function trimToMax(): void {
  while (cache.size > MAX_SIZE && keyOrder.length > 0) {
    evictOldest();
  }
}

/** Simple non-crypto hash for cache key. */
function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h = (h << 5) - h + c;
    h = h & h;
  }
  return String(h);
}

export function makePlannerCacheKey(goal: string, uiSummary: string | undefined): string {
  const part = uiSummary ?? "no-ui";
  return simpleHash(goal + "\n" + part);
}

export function getCachedPlan(key: string): RawPlan | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    cache.delete(key);
    const idx = keyOrder.indexOf(key);
    if (idx >= 0) keyOrder.splice(idx, 1);
    return null;
  }
  // Move to end (most recently used)
  const idx = keyOrder.indexOf(key);
  if (idx >= 0) {
    keyOrder.splice(idx, 1);
    keyOrder.push(key);
  }
  return entry.plan;
}

export function setCachedPlan(key: string, plan: RawPlan): void {
  trimToMax();
  if (cache.size >= MAX_SIZE && !cache.has(key)) {
    evictOldest();
  }
  cache.set(key, { plan, createdAt: Date.now() });
  if (!keyOrder.includes(key)) {
    keyOrder.push(key);
  }
}
