/**
 * Create UI Generator
 *
 * Generates a new UI layout from scratch using AI SDK Core (generateText).
 */

import { generateText } from "ai";
import { getDefaultModel } from "../llm/models";
import type { AIResponse } from "../ai-contract/types";
import type { LayoutNode } from "../../shared/schema";
import { buildCreateUIPrompt } from "../prompts/createPrompt";
import { SYSTEM_PROMPT } from "../prompts/systemPrompt";
import { validateModelOutput } from "./validator";
import { ensureFlexRoot } from "./layout-utils";
import { detectFailure, createErrorResponse } from "./failure";
import { diffIntentVsUI } from "./intent-diff";
import { evaluateAllRules, formatViolations } from "../design-rules";

/**
 * Generate a new UI layout from scratch
 *
 * @param userPrompt - The natural language description of the UI to create
 * @param existingUI - Optional existing UI (usually null for create)
 * @returns AIResponse with the generated UI
 */
export async function generateCreateUI(
  userPrompt: string,
  existingUI?: LayoutNode | null
): Promise<AIResponse> {
  const prompt = buildCreateUIPrompt(userPrompt);

  const result = await generateText({
    model: getDefaultModel(),
    prompt,
    system: SYSTEM_PROMPT,
    temperature: 0,
  });
  let rawResponse = result.text ?? "";

  // Validate JSON after every generation
  let validationResult = validateModelOutput(rawResponse, "create");
  let retryCount = 0;
  let lastRawResponse = rawResponse;

  // Handle failures (reject / retry / error JSON)
  let failureDetection = detectFailure(validationResult, lastRawResponse);

  // Retry logic (max 1 retry)
  if (failureDetection.isFailure && failureDetection.reason !== "json_parse_failed" && retryCount < 1) {
    console.log(`[RETRY] Attempting retry ${retryCount + 1} for create operation`);

    const retryResult = await generateText({
      model: getDefaultModel(),
      prompt,
      system: SYSTEM_PROMPT,
      temperature: 0,
    });
    lastRawResponse = retryResult.text ?? "";
    validationResult = validateModelOutput(lastRawResponse, "create");
    retryCount = 1;
    failureDetection = detectFailure(validationResult, lastRawResponse);
  }

  // If still failing after retry, reject
  if (failureDetection.isFailure) {
    const failureResponse = createErrorResponse(
      failureDetection.reason,
      failureDetection.failureType!,
      failureDetection.details,
      lastRawResponse
    );
    const error = new Error(failureResponse.message);
    (error as any).failureResponse = failureResponse;
    (error as any).validationErrors = validationResult.errors;
    (error as any).retryAttempted = retryCount > 0;
    throw error;
  }

  // Validation passed - check design rules (heuristic validator loop)
  if (!validationResult.parsedResponse) {
    throw new Error("Validation passed but parsedResponse is missing");
  }

  let ui = validationResult.parsedResponse.ui as LayoutNode;

  // Intent vs UI diff (heuristic): one retry if big mismatch
  const diff = diffIntentVsUI(userPrompt, ui);
  if (!diff.ok && diff.reason) {
    console.log("[CREATE] Intent mismatch:", diff.reason, "- retrying once with feedback");
    const intentRetryResult = await generateText({
      model: getDefaultModel(),
      prompt: prompt + "\n\nIntent mismatch: " + diff.reason + "\nRegenerate JSON to match the user request.",
      system: SYSTEM_PROMPT,
      temperature: 0,
    });
    const intentValidation = validateModelOutput(intentRetryResult.text ?? "", "create");
    if (intentValidation.valid && intentValidation.parsedResponse) {
      const retryDiff = diffIntentVsUI(userPrompt, intentValidation.parsedResponse.ui as LayoutNode);
      if (retryDiff.ok) {
        validationResult = intentValidation;
        ui = validationResult.parsedResponse!.ui as LayoutNode;
      }
    }
  }

  const maxDesignRuleRetries = 1;

  for (let designRetry = 0; designRetry <= maxDesignRuleRetries; designRetry++) {
    const designEval = evaluateAllRules(ui);
    if (designEval.passed) {
      const response = validationResult.parsedResponse as AIResponse;
      return { ...response, ui: ensureFlexRoot(response.ui) };
    }

    const violationMessages = formatViolations(designEval);
    if (violationMessages.length === 0) {
      const response = validationResult.parsedResponse as AIResponse;
      return { ...response, ui: ensureFlexRoot(response.ui) };
    }

    if (designRetry >= maxDesignRuleRetries) {
      console.log(`[CREATE] Design rule violations present after ${maxDesignRuleRetries} retry(ies), accepting output`);
      const response = validationResult.parsedResponse as AIResponse;
      return { ...response, ui: ensureFlexRoot(response.ui) };
    }

    const violationFeedback = [
      "",
      "You violated these rules:",
      ...violationMessages.map((m) => `- ${m}`),
      "",
      "Regenerate ONLY the JSON.",
    ].join("\n");

    const promptWithViolations = buildCreateUIPrompt(userPrompt) + violationFeedback;
    console.log(`[CREATE] Design rule violations detected, retrying with feedback (${violationMessages.length} violations)`);

    const designRetryResult = await generateText({
      model: getDefaultModel(),
      prompt: promptWithViolations,
      system: SYSTEM_PROMPT,
      temperature: 0,
    });
    const retryRawResponse = designRetryResult.text ?? "";

    const retryValidation = validateModelOutput(retryRawResponse, "create");
    if (!retryValidation.valid || !retryValidation.parsedResponse) {
      console.warn(`[CREATE] Design-rule retry produced invalid JSON, accepting previous output`);
      const response = validationResult.parsedResponse as AIResponse;
      return { ...response, ui: ensureFlexRoot(response.ui) };
    }

    validationResult = retryValidation;
    ui = validationResult.parsedResponse!.ui as LayoutNode;
  }

  const response = validationResult.parsedResponse as AIResponse;
  return { ...response, ui: ensureFlexRoot(response.ui) };
}
