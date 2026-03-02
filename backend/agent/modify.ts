/**
 * Modify UI Generator
 *
 * Modifies an existing UI layout using patch-based updates (JSON Patch, RFC 6902).
 * Uses AI SDK Core (generateText) with OpenAI.
 */

import { generateText } from "ai";
import { getDefaultModel } from "../llm/models";
import type { AIResponse } from "../ai-contract/types";
import type { LayoutNode } from "../../shared/schema";
import { buildPatchModifyPrompt } from "../prompts/patchPrompt";
import { SYSTEM_PROMPT } from "../prompts/systemPrompt";
import { validateLayoutNodeDirect, isDataCapabilityValidationError } from "./validator";
import { validatePatchResponse } from "./patch-validator";
import { applyPatch } from "./patch-applier";
import { normalizeParsedPatches, convertSemanticPatchesToJsonPatch } from "./semantic-patch";
import { getAddressableTargets } from "./path-resolver";
import { detectFailure, createErrorResponse } from "./failure";
import { UnfulfillableModifyError } from "./errors";
import { postProcessLayoutNode } from "../post-processor";
import { ensureFlexRoot } from "./layout-utils";

/**
 * Modify an existing UI layout using patch-based updates
 * 
 * @param userPrompt - The natural language description of the changes to apply
 * @param existingUI - The current UI layout to modify
 * @returns AIResponse with the modified UI
 */
export async function generateModifyUI(
  userPrompt: string,
  existingUI: LayoutNode
): Promise<AIResponse> {
  const existingValidation = validateLayoutNodeDirect(existingUI);
  if (!existingValidation.valid) {
    throw new Error(
      `Invalid existingUI structure: ${existingValidation.errors?.join(", ") || "Unknown validation error"}`
    );
  }

  const prompt = buildPatchModifyPrompt(existingUI, userPrompt);

  const result = await generateText({
    model: getDefaultModel(),
    prompt,
    system: SYSTEM_PROMPT,
    temperature: 0,
  });
  const rawResponse = result.text ?? "";

  // Validate patch response
  let patchValidationResult = validatePatchResponse(rawResponse, existingUI);
  let retryCount = 0;
  let lastRawResponse = rawResponse;

  // If request cannot be fulfilled (e.g. element/label not found), throw with user-facing reason
  if (patchValidationResult.unfulfillable === true && patchValidationResult.unfulfillableReason) {
    throw new UnfulfillableModifyError(patchValidationResult.unfulfillableReason);
  }

  // Handle failures (reject / retry / error JSON)
  // Convert patch validation result to a format compatible with detectFailure
  const validationResult = {
    valid: patchValidationResult.valid,
    parsedResponse: patchValidationResult.parsedResponse
      ? {
          intent: "modify" as const,
          ui: existingUI, // Placeholder, will be replaced after patch application
          explanation: patchValidationResult.parsedResponse.explanation,
        }
      : undefined,
    errors: patchValidationResult.errors,
    rawParsed: patchValidationResult.rawParsed,
  };

  let failureDetection = detectFailure(validationResult, lastRawResponse);

  // Retry logic (max 1 retry)
  if (failureDetection.isFailure && failureDetection.reason !== "json_parse_failed" && retryCount < 1) {
    console.log(`[RETRY] Attempting retry ${retryCount + 1} for patch-based modify operation`);

    const retryResult = await generateText({
      model: getDefaultModel(),
      prompt,
      system: SYSTEM_PROMPT,
      temperature: 0,
    });
    lastRawResponse = retryResult.text ?? "";
    patchValidationResult = validatePatchResponse(lastRawResponse, existingUI);
    retryCount = 1;

    if (patchValidationResult.unfulfillable === true && patchValidationResult.unfulfillableReason) {
      throw new UnfulfillableModifyError(patchValidationResult.unfulfillableReason);
    }

    const retryValidationResult = {
      valid: patchValidationResult.valid,
      parsedResponse: patchValidationResult.parsedResponse
        ? {
            intent: "modify" as const,
            ui: existingUI,
            explanation: patchValidationResult.parsedResponse.explanation,
          }
        : undefined,
      errors: patchValidationResult.errors,
      rawParsed: patchValidationResult.rawParsed,
    };
    
    failureDetection = detectFailure(retryValidationResult, lastRawResponse);
  }

  // If still failing after retry, reject (unfulfillable already thrown above)
  if (failureDetection.isFailure || !patchValidationResult.valid || !patchValidationResult.parsedResponse) {
    const failureResponse = createErrorResponse(
      failureDetection.reason,
      failureDetection.failureType!,
      failureDetection.details,
      lastRawResponse
    );
    const errorMessage = failureResponse.message || patchValidationResult.errors?.join(", ") || "Validation failed";
    const error = new Error(errorMessage);
    (error as any).failureResponse = failureResponse;
    (error as any).validationErrors = patchValidationResult.errors;
    (error as any).retryAttempted = retryCount > 0;
    throw error;
  }

  // Resolve semantic patches to path-based (target + position -> path)
  const normalized = normalizeParsedPatches(patchValidationResult.parsedResponse.patches as any[]);
  const converted = convertSemanticPatchesToJsonPatch(existingUI, normalized);
  if (converted.resolutionError) {
    throw new Error(
      `${converted.resolutionError.message} Allowed targets: ${converted.resolutionError.allowedTargets.slice(0, 25).join(", ")}.`
    );
  }
  const patchesToApply = converted.patches;

  // Apply patches to existing UI (with one retry on apply failure using error feedback + allowedTargets)
  let patchApplyResult = applyPatch(existingUI, patchesToApply);
  let effectiveExplanation = patchValidationResult.parsedResponse.explanation;

  if (!patchApplyResult.success || !patchApplyResult.modifiedUI) {
    const applyError = patchApplyResult.error || "Unknown error";
    const allowedTargets = getAddressableTargets(existingUI).map((t) => t.id);
    const retryErrorWithTargets = allowedTargets.length
      ? `${applyError} Use ONLY "target" with one of these ids: ${allowedTargets.slice(0, 25).join(", ")}.`
      : applyError;
    console.log(`[MODIFY] Patch apply failed, retrying with error feedback: ${applyError}`);
    const retryPrompt = buildPatchModifyPrompt(existingUI, userPrompt, { previousPatchError: retryErrorWithTargets });
    const applyRetryResult = await generateText({
      model: getDefaultModel(),
      prompt: retryPrompt,
      system: SYSTEM_PROMPT,
      temperature: 0,
    });
    const retryRawResponse = applyRetryResult.text ?? "";
    const retryValidation = validatePatchResponse(retryRawResponse, existingUI);
    if (retryValidation.unfulfillable && retryValidation.unfulfillableReason) {
      throw new UnfulfillableModifyError(retryValidation.unfulfillableReason);
    }
    if (!retryValidation.valid || !retryValidation.parsedResponse?.patches?.length) {
      throw new Error(`Failed to apply patches: ${applyError}`);
    }
    const retryNormalized = normalizeParsedPatches(retryValidation.parsedResponse.patches as any[]);
    const retryConverted = convertSemanticPatchesToJsonPatch(existingUI, retryNormalized);
    if (retryConverted.resolutionError) {
      throw new Error(`Failed to apply patches after retry: ${retryConverted.resolutionError.message}`);
    }
    patchApplyResult = applyPatch(existingUI, retryConverted.patches);
    if (!patchApplyResult.success || !patchApplyResult.modifiedUI) {
      throw new Error(
        `Failed to apply patches after retry: ${patchApplyResult.error || "Unknown error"}`
      );
    }
    effectiveExplanation = retryValidation.parsedResponse.explanation;
  }

  // Post-process: ensure schema compliance (e.g. type "component" has props.component; fallback to Label if missing)
  let postProcessed = postProcessLayoutNode(patchApplyResult.modifiedUI) as LayoutNode;
  let finalUI = ensureFlexRoot(postProcessed);

  // Validate the modified UI
  let modifiedUIValidation = validateLayoutNodeDirect(finalUI);

  // Retry once on data-capability validation failure (wrong component for data shape)
  if (
    !modifiedUIValidation.valid &&
    modifiedUIValidation.errors?.length &&
    isDataCapabilityValidationError(modifiedUIValidation.errors)
  ) {
    const dataCapabilityError = modifiedUIValidation.errors.join(" ");
    console.log(`[MODIFY] Data capability validation failed, retrying with guidance: ${dataCapabilityError}`);
    const dataRetryPrompt = buildPatchModifyPrompt(existingUI, userPrompt, {
      previousPatchError: `Validation failed: ${dataCapabilityError} Output corrected patches that use the suggested component and data shape.`,
    });
    const dataRetryResult = await generateText({
      model: getDefaultModel(),
      prompt: dataRetryPrompt,
      system: SYSTEM_PROMPT,
      temperature: 0,
    });
    const dataRetryResponse = dataRetryResult.text ?? "";
    const dataRetryValidation = validatePatchResponse(dataRetryResponse, existingUI);
    if (dataRetryValidation.valid && dataRetryValidation.parsedResponse?.patches?.length) {
      const dataRetryNormalized = normalizeParsedPatches(dataRetryValidation.parsedResponse.patches as any[]);
      const dataRetryConverted = convertSemanticPatchesToJsonPatch(existingUI, dataRetryNormalized);
      if (!dataRetryConverted.resolutionError) {
        const dataRetryApply = applyPatch(existingUI, dataRetryConverted.patches);
        if (dataRetryApply.success && dataRetryApply.modifiedUI) {
          postProcessed = postProcessLayoutNode(dataRetryApply.modifiedUI) as LayoutNode;
          finalUI = ensureFlexRoot(postProcessed);
          modifiedUIValidation = validateLayoutNodeDirect(finalUI);
        }
      }
    }
  }

  if (!modifiedUIValidation.valid) {
    throw new Error(
      `Modified UI failed validation: ${modifiedUIValidation.errors?.join(", ") || "Unknown validation error"}`
    );
  }

  // Return AIResponse with modified UI
  return {
    intent: "modify",
    ui: finalUI,
    explanation: effectiveExplanation,
  };
}
