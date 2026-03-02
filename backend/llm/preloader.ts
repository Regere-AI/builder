/**
 * Model preloader — no-op when using AI SDK (OpenAI).
 * Kept for API compatibility; startup no longer preloads Ollama.
 */
export async function preloadModels(): Promise<void> {
  // AI SDK flow: no preload needed
}

export async function checkModelStatus(): Promise<{ [model: string]: boolean }> {
  return {};
}
