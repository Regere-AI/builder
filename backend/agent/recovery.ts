/**
 * Retry or Adjust Plan on Failure
 * 
 * When a planned step fails validation or rendering, the agent:
 * - Does not stop immediately
 * - Attempts to recover intelligently
 * - Either retries the step or adjusts the remaining plan
 * 
 * This is what turns the system from a generator into a self-correcting agent.
 */

import { generateText } from "ai";
import { getDefaultModel } from "../llm/models";
import type { Plan, PlanStep, StepValidationResult } from "./types";
import type { LayoutNode } from "../../shared/schema";
import type { AIResponse } from "../ai-contract/types";
import { buildModifyUIPrompt } from "../prompts/modifyPrompt";
import { SYSTEM_PROMPT } from "../prompts/systemPrompt";
import { validateModelOutput } from "./validator";
import { generatePlan } from "./planner";
import { normalizePlan } from "./plan-order";
import { detectFailure, detectFailureFromStepValidation, createErrorResponse, type FailureReason, type FailureResponse } from "./failure";

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  /** Maximum number of retries per step */
  maxRetriesPerStep: number;
  /** Maximum number of plan adjustments */
  maxPlanAdjustments: number;
  /** Whether to retry on schema errors */
  retryOnSchemaError: boolean;
  /** Whether to retry on render errors */
  retryOnRenderError: boolean;
}

/**
 * Default retry policy
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetriesPerStep: 1,
  maxPlanAdjustments: 1,
  retryOnSchemaError: true,
  retryOnRenderError: true,
};

/**
 * Recovery strategy
 */
export type RecoveryStrategy = "retry" | "adjust_plan" | "skip_step" | "abort";

/**
 * Recovery result
 */
export interface RecoveryResult {
  /** Whether recovery was successful */
  success: boolean;
  /** Strategy used for recovery */
  strategy: RecoveryStrategy;
  /** Updated UI (if recovery succeeded) */
  updatedUI?: LayoutNode;
  /** Updated plan (if plan was adjusted) */
  updatedPlan?: Plan;
  /** Error message (if recovery failed) */
  error?: string;
  /** Number of retries attempted */
  retriesAttempted: number;
}

/**
 * Determine recovery strategy based on failure
 * 
 * This is the SINGLE AUTHORITY for retry decisions.
 * All retry logic is centralized here.
 * 
 * Strategy selection:
 * - Check retry limits first (policy enforcement)
 * - Check failure type (from failure.ts)
 * - Decide: retry, adjust_plan, skip_step, or abort
 */
function determineRecoveryStrategy(
  stepValidation: StepValidationResult,
  retryCount: number,
  planAdjustmentCount: number,
  policy: RetryPolicy,
  failureReason?: FailureReason
): RecoveryStrategy {
  // Hard limits: if we've exceeded all limits, abort
  if (retryCount >= policy.maxRetriesPerStep && planAdjustmentCount >= policy.maxPlanAdjustments) {
    return "abort";
  }

  // If we've exceeded retry limit, try plan adjustment
  if (retryCount >= policy.maxRetriesPerStep) {
    if (planAdjustmentCount < policy.maxPlanAdjustments) {
      return "adjust_plan";
    }
    return "abort";
  }

  // Check if failure is retryable based on type
  // Some failures (like JSON parse errors) are not worth retrying
  const nonRetryableReasons: FailureReason[] = [
    "json_parse_failed", // If JSON is malformed, retry won't help
    "invalid_intent", // Intent mismatch is deterministic
  ];

  if (failureReason && nonRetryableReasons.includes(failureReason)) {
    // Non-retryable failure - try plan adjustment if available
    if (planAdjustmentCount < policy.maxPlanAdjustments) {
      return "adjust_plan";
    }
    return "abort";
  }

  // Schema error → retry with stricter instruction
  if (!stepValidation.schemaValid && policy.retryOnSchemaError) {
    return "retry";
  }

  // Render error → retry (may need adjustment)
  if (!stepValidation.renderValid && policy.retryOnRenderError) {
    return "retry";
  }

  // If both failed and retries available, retry
  if (retryCount < policy.maxRetriesPerStep) {
    return "retry";
  }

  // If retries exhausted, try plan adjustment
  if (planAdjustmentCount < policy.maxPlanAdjustments) {
    return "adjust_plan";
  }

  // All options exhausted
  return "abort";
}

/**
 * Build retry prompt with rich failure context
 * 
 * Rebuild prompt with:
 * - Detailed failure reason from failure.ts
 * - Specific errors to avoid repeating
 * - Re-emphasized schema/design rules
 * - Clear instructions on what NOT to do
 */
function buildRetryPrompt(
  step: PlanStep,
  currentUI: LayoutNode,
  failureResponse: FailureResponse,
  retryCount: number
): string {
  // Build base prompt for modify steps
  // For now, use full UI modification
  const basePrompt = buildModifyUIPrompt(currentUI, step.description);

  // Extract failure context
  const retryContext = failureResponse.retryContext;
  const whatWentWrong = retryContext?.whatWentWrong || failureResponse.message;
  const failedFields = retryContext?.failedFields || [];
  const suggestions = retryContext?.suggestions || [];

  // Build failure-specific instructions
  let failureInstructions = `\n\nPREVIOUS ATTEMPT FAILED (Retry ${retryCount + 1}):\n`;
  if (failureResponse.failureType.type === "design_rule_violation") {
    failureInstructions += `You violated these rules:\n`;
    failureResponse.details.forEach((d) => {
      failureInstructions += `- ${d}\n`;
    });
    failureInstructions += `\nRegenerate ONLY the JSON.\n\n`;
  } else {
    failureInstructions += `Your previous output failed due to: ${whatWentWrong}\n\n`;
  }

  // Add specific errors to avoid
  if (failedFields.length > 0) {
    failureInstructions += `DO NOT repeat these errors:\n`;
    failedFields.forEach(field => {
      failureInstructions += `- Field "${field}" had validation errors\n`;
    });
    failureInstructions += `\n`;
  }

  // Add specific failure details (skip for design_rule_violation - already listed above)
  if (failureResponse.details.length > 0 && failureResponse.failureType.type !== "design_rule_violation") {
    failureInstructions += `Specific errors encountered:\n`;
    failureResponse.details.slice(0, 5).forEach((detail, idx) => {
      failureInstructions += `${idx + 1}. ${detail}\n`;
    });
    failureInstructions += `\n`;
  }

  // Add suggestions based on failure type
  if (suggestions.length > 0) {
    failureInstructions += `CRITICAL CORRECTIONS - Follow these rules strictly:\n`;
    suggestions.forEach((suggestion, idx) => {
      failureInstructions += `${idx + 1}. ${suggestion}\n`;
    });
    failureInstructions += `\n`;
  }

  // Re-emphasize schema/design rules based on failure type
  switch (failureResponse.failureType.type) {
    case "schema_validation_error":
      failureInstructions += `SCHEMA VALIDATION REQUIREMENTS:\n`;
      failureInstructions += `- Ensure ALL required fields are present for ${failureResponse.failureType.failedSchema}\n`;
      failureInstructions += `- Check field types match the schema exactly\n`;
      failureInstructions += `- Verify nested structures match the expected format\n`;
      failureInstructions += `- Double-check all component names are valid\n`;
      failureInstructions += `- Ensure all props match the expected format\n`;
      break;

    case "renderability_error":
      failureInstructions += `RENDERABILITY REQUIREMENTS:\n`;
      failureInstructions += `- Ensure all components are valid and registered\n`;
      failureInstructions += `- Check that layout structures are correct\n`;
      failureInstructions += `- Verify component props match expected format\n`;
      failureInstructions += `- Ensure the UI structure is renderable\n`;
      break;

    case "design_rule_violation":
      failureInstructions += `DESIGN RULE REQUIREMENTS:\n`;
      failureInstructions += `- Review and fix all design rule violations\n`;
      failureInstructions += `- Ensure proper spacing, accessibility, and consistency\n`;
      failureInstructions += `- Adjust component usage to comply with rules\n`;
      break;

    case "parse_error":
      failureInstructions += `JSON FORMAT REQUIREMENTS:\n`;
      failureInstructions += `- Ensure the response is valid JSON\n`;
      failureInstructions += `- Check for unclosed brackets or quotes\n`;
      failureInstructions += `- Remove any markdown code fences if present\n`;
      failureInstructions += `- Output ONLY valid JSON, no extra text\n`;
      break;
  }

  failureInstructions += `\n---\n\n`;

  return failureInstructions + basePrompt;
}

/**
 * JSON Fixer - Lightweight model call to fix broken JSON
 * 
 * When parse errors occur, use a small, fast model to fix JSON syntax errors.
 * This is faster than a full retry and often succeeds for simple syntax issues.
 */
async function fixBrokenJSON(brokenJSON: string): Promise<string | null> {
  const fixerPrompt = `Here is a broken JSON string. Fix only the syntax errors and return only the corrected JSON, without any explanation, comments, or markdown:

${brokenJSON.substring(0, 2000)}`;

  try {
    console.log(`[JSON-FIXER] Attempting to fix broken JSON (length: ${brokenJSON.length})`);
    const result = await generateText({
      model: getDefaultModel(),
      prompt: fixerPrompt,
      temperature: 0,
    });
    const fixedJSON = result.text ?? "";
    
    // Try to extract JSON from the response (might have extra text)
    const jsonMatch = fixedJSON.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      // Validate it's actually valid JSON
      try {
        JSON.parse(jsonMatch[0]);
        console.log(`[JSON-FIXER] Successfully fixed JSON`);
        return jsonMatch[0];
      } catch {
        // Fixed JSON is still invalid
        console.warn(`[JSON-FIXER] Fixed JSON is still invalid`);
        return null;
      }
    }
    
    return null;
  } catch (error) {
    console.warn(`[JSON-FIXER] Failed to fix JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Retry failed step
 * 
 * On failure:
 * - Build failure response with rich context
 * - If parse error, try JSON fixer first (lightweight)
 * - Rebuild prompt with failure context and stronger constraints
 * - Re-run generator
 * - Re-validate
 */
export async function retryFailedStep(
  step: PlanStep,
  currentUI: LayoutNode,
  stepValidation: StepValidationResult,
  retryCount: number,
  failureResponse?: FailureResponse,
  rawResponse?: string
): Promise<{ success: boolean; result?: AIResponse; error?: string }> {
  // If we don't have a failure response, create a basic one
  if (!failureResponse) {
    const failureDetection = detectFailureFromStepValidation(stepValidation);
    if (!failureDetection.failureType) {
      failureDetection.failureType = {
        type: "unknown_error",
        message: stepValidation.reason || "Unknown validation error",
      };
    }
    failureResponse = createErrorResponse(
      failureDetection.reason,
      failureDetection.failureType,
      failureDetection.details
    );
  }
  
  // At this point, failureResponse is guaranteed to be defined
  const finalFailureResponse = failureResponse;

  // If this is a parse error and we have raw response, try JSON fixer first (lightweight)
  if (finalFailureResponse.failureType.type === "parse_error" && rawResponse) {
    console.log(`[RECOVERY] Parse error detected, attempting JSON fixer...`);
    const fixedJSON = await fixBrokenJSON(rawResponse);
    
    if (fixedJSON) {
      // Try to validate the fixed JSON
      const fixedValidation = validateModelOutput(fixedJSON, "modify");
      
      if (fixedValidation.valid && fixedValidation.parsedResponse) {
        console.log(`[RECOVERY] JSON fixer succeeded, using fixed output`);
        return {
          success: true,
          result: fixedValidation.parsedResponse as AIResponse,
        };
      } else {
        console.warn(`[RECOVERY] JSON fixer produced output but validation failed, proceeding with full retry`);
      }
    } else {
      console.warn(`[RECOVERY] JSON fixer failed, proceeding with full retry`);
    }
  }

  // Build retry prompt with rich failure context
  const retryPrompt = buildRetryPrompt(step, currentUI, finalFailureResponse, retryCount);

  console.log(`[RECOVERY] Retry ${retryCount + 1} for step "${step.description}"`);
  console.log(`[RECOVERY] Failure reason: ${finalFailureResponse.reason}`);
  console.log(`[RECOVERY] What went wrong: ${finalFailureResponse.retryContext?.whatWentWrong || "Unknown"}`);

  try {
    const retryResult = await generateText({
      model: getDefaultModel(),
      prompt: retryPrompt,
      system: SYSTEM_PROMPT,
      temperature: 0.1,
    });
    const retryRawResponse = retryResult.text ?? "";

    const validationResult = validateModelOutput(retryRawResponse, "modify");

    if (!validationResult.valid) {
      const errorMsg = `Retry ${retryCount + 1} failed: ${validationResult.errors?.join(", ") || "Validation failed"}`;
      console.error(`[RECOVERY] ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
      };
    }

    // At this point, parsedResponse is guaranteed to exist and be valid
    if (!validationResult.parsedResponse) {
      const errorMsg = "Validation passed but parsedResponse is missing";
      console.error(`[RECOVERY] ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
      };
    }

    console.log(`[RECOVERY] Retry ${retryCount + 1} succeeded`);
    return {
      success: true,
      result: validationResult.parsedResponse as AIResponse,
    };
  } catch (error) {
    const errorMsg = `Retry ${retryCount + 1} failed: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`[RECOVERY] ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Adjust remaining plan
 * 
 * If retry fails:
 * - Drop or simplify the failed step
 * - Or regenerate a new plan from the current UI
 * 
 * Important:
 * - Already successful steps are preserved
 * - Only future steps change
 */
export async function adjustRemainingPlan(
  originalPlan: Plan,
  failedStepIndex: number,
  currentUI: LayoutNode,
  originalGoal: string
): Promise<Plan> {
  const remainingSteps = originalPlan.steps.slice(failedStepIndex + 1);

  if (remainingSteps.length > 0) {
    console.log(`[RECOVERY] Dropping failed step ${failedStepIndex + 1}, continuing with ${remainingSteps.length} remaining steps`);
    return {
      steps: remainingSteps,
    };
  } else {
    console.log(`[RECOVERY] No remaining steps, regenerating plan for remaining work`);
    try {
      const remainingGoal = `Complete the remaining work given current UI: "${originalGoal}". The previous step failed; focus on simpler, more achievable improvements.`;
      const rawPlan = await generatePlan(remainingGoal, currentUI);
      const normalizedNew = normalizePlan(rawPlan);
      const limitedSteps = normalizedNew.steps.slice(0, Math.min(2, normalizedNew.steps.length));
      if (limitedSteps.length === 0) {
        return { steps: [] };
      }
      // Merge: already-executed steps (preserved) + new steps with remapped ids/depends
      const prefix = originalPlan.steps.slice(0, failedStepIndex);
      const offset = failedStepIndex;
      const totalLen = prefix.length + limitedSteps.length;
      const mergedSteps = limitedSteps.map((s, i) => ({
        ...s,
        id: `step-${offset + i}`,
        dependsOn: (s.dependsOn ?? []).map((d) => offset + d).filter((d) => d >= 0 && d < totalLen),
      }));
      return { steps: [...prefix, ...mergedSteps] };
    } catch (error) {
      console.error(`[RECOVERY] Failed to regenerate plan: ${error instanceof Error ? error.message : String(error)}`);
      return { steps: [] };
    }
  }
}

/**
 * Attempt recovery from step failure
 * 
 * Main recovery function that:
 * - Determines recovery strategy
 * - Attempts retry or plan adjustment
 * - Returns recovery result
 */
export async function attemptRecovery(
  step: PlanStep,
  stepIndex: number,
  currentUI: LayoutNode,
  stepValidation: StepValidationResult,
  originalPlan: Plan,
  originalGoal: string,
  retryCount: number,
  planAdjustmentCount: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  validationResult?: import("./validator").ValidationResult,
  rawResponse?: string
): Promise<RecoveryResult> {
  // Detect failure type (descriptive only - from failure.ts)
  let failureReason: FailureReason | undefined;
  if (validationResult) {
    const failureDetection = detectFailure(validationResult);
    if (failureDetection.isFailure) {
      failureReason = failureDetection.reason;
    }
  }

  // Determine recovery strategy (CENTRALIZED DECISION)
  // This is the single authority for retry decisions
  const strategy = determineRecoveryStrategy(
    stepValidation,
    retryCount,
    planAdjustmentCount,
    policy,
    failureReason
  );

  console.log(`[RECOVERY] Step ${stepIndex + 1} failed. Strategy: ${strategy} (retry count: ${retryCount}, plan adjustments: ${planAdjustmentCount}, failure reason: ${failureReason || "unknown"})`);

  if (strategy === "retry") {
    // Build failure response for retry prompt context
    let failureResponse: FailureResponse | undefined;
    if (validationResult) {
      const failureDetection = detectFailure(validationResult);
      if (failureDetection.isFailure && failureDetection.failureType) {
        failureResponse = createErrorResponse(
          failureDetection.reason,
          failureDetection.failureType,
          failureDetection.details
        );
      }
    }
    
    // If we don't have failure response from validation, try step validation
    if (!failureResponse) {
      const stepFailureDetection = detectFailureFromStepValidation(stepValidation);
      if (stepFailureDetection.isFailure && stepFailureDetection.failureType) {
        failureResponse = createErrorResponse(
          stepFailureDetection.reason,
          stepFailureDetection.failureType,
          stepFailureDetection.details
        );
      }
    }

    const retryResult = await retryFailedStep(
      step,
      currentUI,
      stepValidation,
      retryCount,
      failureResponse,
      rawResponse
    );

    if (retryResult.success && retryResult.result) {
      return {
        success: true,
        strategy: "retry",
        updatedUI: retryResult.result.ui,
        retriesAttempted: retryCount + 1,
      };
    } else {
      // Retry failed, try plan adjustment
      if (planAdjustmentCount < policy.maxPlanAdjustments) {
        const adjustedPlan = await adjustRemainingPlan(
          originalPlan,
          stepIndex,
          currentUI,
          originalGoal
        );

        return {
          success: adjustedPlan.steps.length > 0,
          strategy: "adjust_plan",
          updatedPlan: adjustedPlan,
          error: adjustedPlan.steps.length === 0 ? "No valid steps remaining after plan adjustment" : undefined,
          retriesAttempted: retryCount + 1,
        };
      } else {
        return {
          success: false,
          strategy: "abort",
          error: retryResult.error || "Retry failed and plan adjustment limit reached",
          retriesAttempted: retryCount + 1,
        };
      }
    }
  } else if (strategy === "adjust_plan") {
    // Adjust the plan
    if (planAdjustmentCount < policy.maxPlanAdjustments) {
      const adjustedPlan = await adjustRemainingPlan(
        originalPlan,
        stepIndex,
        currentUI,
        originalGoal
      );

      return {
        success: adjustedPlan.steps.length > 0,
        strategy: "adjust_plan",
        updatedPlan: adjustedPlan,
        error: adjustedPlan.steps.length === 0 ? "No valid steps remaining after plan adjustment" : undefined,
        retriesAttempted: retryCount,
      };
    } else {
      return {
        success: false,
        strategy: "abort",
        error: "Plan adjustment limit reached",
        retriesAttempted: retryCount,
      };
    }
  } else {
    // Abort
    return {
      success: false,
      strategy: "abort",
      error: "Recovery strategy determined abort",
      retriesAttempted: retryCount,
    };
  }
}
