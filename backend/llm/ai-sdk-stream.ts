/**
 * AI SDK streaming for executor steps (plan-progress SSE).
 * Uses centralized OpenAI model from llm/models.
 */
// Env loaded by llm/models (project root .env)
import { streamText } from "ai";
import { getExecutorModel } from "./models";

export interface StreamExecutorStepOptions {
  prompt: string;
  system: string;
  temperature?: number;
}

/**
 * Stream executor step using AI SDK streamText.
 * Calls onChunk for each token; returns full accumulated text when done.
 */
export async function streamExecutorStep(
  options: StreamExecutorStepOptions,
  onChunk: (chunk: string) => void
): Promise<string> {
  const { prompt, system, temperature = 0.1 } = options;
  const model = getExecutorModel();

  const result = streamText({
    model,
    prompt,
    system,
    temperature,
    maxRetries: 0,
  });

  let fullText = "";
  for await (const part of result.textStream) {
    fullText += part;
    onChunk(part);
  }
  return fullText;
}
