/**
 * AI SDK Core — Centralized model selection (OpenAI provider).
 *
 * Uses @ai-sdk/openai and env: OPENAI_API_KEY, OPENAI_MODEL, PLANNER_MODEL, EXECUTOR_MODEL.
 * All agent LLM calls (planner, create, modify, executor) use these models.
 */

// Load .env from project root so OPENAI_API_KEY is available when run from backend/
import "../env";
import { createOpenAI } from "@ai-sdk/openai";

const OPENAI_MODEL_DEFAULT = "gpt-4o-mini";

/** Models that do not exist (e.g. typos or future names); fall back to default. */
const INVALID_MODEL_IDS = new Set([
  "gpt-5-nano",
  "gpt-5-mini",
  "gpt-5",
  "openai:gpt-5-nano",
  "openai:gpt-5-mini",
  "openai:gpt-5",
]);

function normalizeModelId(raw: string): string {
  let id = (raw || "").trim() || OPENAI_MODEL_DEFAULT;
  // Strip provider prefix (e.g. "openai:gpt-5-nano" -> "gpt-5-nano")
  if (id.includes(":")) {
    id = id.split(":").pop()!.trim();
  }
  if (!id) id = OPENAI_MODEL_DEFAULT;
  if (INVALID_MODEL_IDS.has(id) || INVALID_MODEL_IDS.has(raw.trim()) || id.startsWith("gpt-5")) {
    console.warn(
      `[LLM] Model "${raw.trim()}" is not available. Use a valid OpenAI model (e.g. gpt-4o-mini, gpt-4o). Falling back to ${OPENAI_MODEL_DEFAULT}.`
    );
    return OPENAI_MODEL_DEFAULT;
  }
  return id;
}

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is required. Set it in .env (see https://platform.openai.com/api-keys)"
    );
  }
  return key;
}

function getDefaultModelId(): string {
  const raw =
    (process.env.OPENAI_MODEL || process.env.DEFAULT_MODEL || OPENAI_MODEL_DEFAULT).trim() ||
    OPENAI_MODEL_DEFAULT;
  return normalizeModelId(raw);
}

function getPlannerModelId(): string {
  const env = process.env.PLANNER_MODEL?.trim();
  if (env) return normalizeModelId(env);
  return getDefaultModelId();
}

function getExecutorModelId(): string {
  const env = process.env.EXECUTOR_MODEL?.trim();
  if (env) return normalizeModelId(env);
  return getDefaultModelId();
}

let openai: ReturnType<typeof createOpenAI> | null = null;

function getOpenAI(): ReturnType<typeof createOpenAI> {
  if (!openai) {
    openai = createOpenAI({ apiKey: getApiKey() });
  }
  return openai;
}

/**
 * Model for create, modify, and default generation.
 */
export function getDefaultModel() {
  const modelId = getDefaultModelId();
  return getOpenAI()(modelId);
}

/**
 * Model for planner (plan generation). Use PLANNER_MODEL to override.
 */
export function getPlannerModel() {
  const modelId = getPlannerModelId();
  return getOpenAI()(modelId);
}

/**
 * Model for executor (plan step execution and streaming). Use EXECUTOR_MODEL to override.
 */
export function getExecutorModel() {
  const modelId = getExecutorModelId();
  return getOpenAI()(modelId);
}

/**
 * Check if OpenAI is configured (for health/feature detection).
 */
export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/**
 * Resolved default model id (after normalization). Use for display/health.
 */
export function getResolvedDefaultModelId(): string {
  return getDefaultModelId();
}
