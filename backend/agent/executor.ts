/**
 * Sequential Execution of Planned Steps
 * 
 * Executes the planner's output, one step at a time, updating the UI state after each step.
 * This is where the system becomes a real agent.
 * 
 * The executor:
 * - Takes an ordered plan and current UI
 * - Executes steps sequentially (no parallel execution)
 * - Updates UI state after each successful step
 * - Stops on failure and returns error + last valid UI
 */

import { generateText } from "ai";
import { getExecutorModel } from "../llm/models";
import type { Plan, PlanStep, StepValidationResult } from "./types";
import type { LayoutNode } from "../../shared/schema";
import type { AIResponse } from "../ai-contract/types";
import { buildPatchModifyPrompt } from "../prompts/patchPrompt";
import { SYSTEM_PROMPT } from "../prompts/systemPrompt";
import {
  validateModelOutput,
  validateLayoutNodeDirect,
  normalizeLayoutNode,
  isDataCapabilityValidationError,
} from "./validator";
import { validatePatchResponse } from "./patch-validator";
import { validatePlanStepPatchValues } from "./patch-plan-step-validator";
import { applyPatch } from "./patch-applier";
import { normalizeParsedPatches, convertSemanticPatchesToJsonPatch } from "./semantic-patch";
import { getAddressableTargets } from "./path-resolver";
import { detectFailure, createErrorResponse } from "./failure";
import { checkRenderability } from "../renderability-check";
import { attemptRecovery, DEFAULT_RETRY_POLICY, type RetryPolicy } from "./recovery";
import { UnfulfillableModifyError } from "./errors";
import { 
  checkStopConditions, 
  shouldStopOnValidationFailure, 
  type StopConditionContext,
  type RetryTracking,
  isRetryAllowed,
  incrementRetryCount,
} from "./stop-conditions";
import { evaluateAllRules, formatViolations } from "../design-rules";
import { ensureFlexRoot } from "./layout-utils";
import { postProcessLayoutNode } from "../post-processor";
import { autoFixTrivialErrors } from "./auto-fix-trivial";
import {
  resetExecutorTelemetry,
  setPlannerMs,
  addExecutorStepMs,
  setTotalMs,
  setStepsCount,
  setRetriesCount,
  setReplansCount,
  logExecutorSummary,
  getExecutorTelemetry,
} from "./telemetry";

/**
 * Execution result for plan execution
 * Extended with validation results and recovery information
 */
export interface PlanExecutionResult {
  /** Whether all steps executed successfully */
  success: boolean;
  /** Final UI after execution (or last valid UI if failed) */
  finalUI: LayoutNode;
  /** Number of steps successfully executed */
  stepsExecuted: number;
  /** Total number of steps in plan */
  totalSteps: number;
  /** Error message if execution failed */
  error?: string;
  /** Step that failed (if any) */
  failedStep?: PlanStep;
  /** Step index that failed (0-based) */
  failedStepIndex?: number;
  /** Validation results for each step */
  validationResults?: StepValidationResult[];
  /** Whether recovery was attempted */
  recoveryAttempted?: boolean;
  /** Recovery strategy used (if any) */
  recoveryStrategy?: "retry" | "adjust_plan" | "skip_step" | "abort";
}

/**
 * Execute a single step from an already-fetched raw LLM response (validation + apply only).
 * Used by executeStep (after generate) and by the streaming plan-progress handler (after streamExecutorStep).
 * Does not perform any LLM calls; throws on validation or apply failure.
 *
 * @param rawResponse - Raw string response from the LLM (patch JSON)
 * @param step - The plan step (for validation context)
 * @param currentUI - The current UI state
 * @returns AIResponse with the updated UI
 * @throws UnfulfillableModifyError | Error on validation or apply failure
 */
export function executeStepFromRawResponse(
  rawResponse: string,
  step: PlanStep,
  currentUI: LayoutNode
): AIResponse {
  const patchValidationResult = validatePatchResponse(rawResponse, currentUI, { rejectFullUI: true });

  // If request cannot be fulfilled (e.g. element/label not found), throw with user-facing reason
  if (patchValidationResult.unfulfillable === true && patchValidationResult.unfulfillableReason) {
    throw new UnfulfillableModifyError(patchValidationResult.unfulfillableReason);
  }

  // If validation failed (and no fullUI fallback), create failure info and throw
  if (!patchValidationResult.valid) {
    const validationResult = {
      valid: patchValidationResult.valid,
      parsedResponse: undefined,
      errors: patchValidationResult.errors,
      rawParsed: patchValidationResult.rawParsed,
    };
    const failureDetection = detectFailure(validationResult, rawResponse);
    if (!failureDetection.failureType) {
      // Fallback if detection didn't provide failure type
      failureDetection.failureType = {
        type: "unknown_error",
        message: failureDetection.details.join("; ") || "Unknown validation error",
      };
    }
    const errorResponse = createErrorResponse(
      failureDetection.reason,
      failureDetection.failureType,
      failureDetection.details,
      rawResponse,
      patchValidationResult.rawParsed
    );
    const detailSuffix =
      errorResponse.details?.length ? ": " + errorResponse.details.join("; ") : "";
    const error = new Error(errorResponse.message + detailSuffix);
    (error as any).failureResponse = errorResponse;
    (error as any).validationErrors = patchValidationResult.errors;
    (error as any).rawResponse = rawResponse; // Store for JSON fixer
    throw error;
  }

  // When model returned full UI instead of patches (e.g. Groq), use it directly
  if (patchValidationResult.fullUI) {
    const normalized = normalizeLayoutNode(patchValidationResult.fullUI);
    const fullUIValidation = validateLayoutNodeDirect(normalized);
    if (!fullUIValidation.valid) {
      throw new Error(
        `Full-UI response failed validation: ${fullUIValidation.errors?.join(", ") || "Unknown validation error"}`
      );
    }
    return {
      intent: "modify",
      ui: ensureFlexRoot(normalized),
      explanation: "Modified UI (full layout returned by model)",
    };
  }

  // Empty patches = no-op (keep current UI)
  if (!patchValidationResult.parsedResponse!.patches.length) {
    return {
      intent: "modify",
      ui: ensureFlexRoot(currentUI),
      explanation: patchValidationResult.parsedResponse!.explanation || "No changes applied",
    };
  }

  // Resolve semantic patches to path-based (LLM may output target + position; runtime resolves to paths)
  const normalizedPatches = normalizeParsedPatches(patchValidationResult.parsedResponse!.patches as any[]);
  const converted = convertSemanticPatchesToJsonPatch(currentUI, normalizedPatches);
  if (converted.resolutionError) {
    const err = converted.resolutionError;
    const allowedList = err.allowedTargets.slice(0, 30).join(", ");
    throw new Error(
      `${err.message} Allowed targets: ${allowedList}${err.allowedTargets.length > 30 ? " (and more)" : ""}.`
    );
  }
  const patchesToApply = converted.patches;

  // Plan step: reject patches that add multiple components in one value (causes duplicate buttons)
  const planStepValidation = validatePlanStepPatchValues(patchesToApply, step.description);
  if (!planStepValidation.valid) {
    throw new Error(planStepValidation.error || "Plan step patch validation failed");
  }

  // Apply patches to current UI (no retry inside this function; caller may retry)
  const patchApplyResult = applyPatch(currentUI, patchesToApply);
  const effectiveExplanation = patchValidationResult.parsedResponse!.explanation;

  if (!patchApplyResult.success || !patchApplyResult.modifiedUI) {
    throw new Error(patchApplyResult.error || "Failed to apply patches");
  }

  // Normalize and post-process: fix type "button" -> component with props.component "Button" so renderer works
  const normalizedUI = normalizeLayoutNode(patchApplyResult.modifiedUI);
  const postProcessed = postProcessLayoutNode(normalizedUI) as LayoutNode;
  const modifiedUIValidation = validateLayoutNodeDirect(postProcessed);

  if (!modifiedUIValidation.valid) {
    throw new Error(
      `Modified UI failed validation: ${modifiedUIValidation.errors?.join(", ") || "Unknown validation error"}`
    );
  }

  return {
    intent: "modify",
    ui: ensureFlexRoot(postProcessed),
    explanation: effectiveExplanation,
  };
}

/**
 * Execute a single plan step (exported for SSE plan-progress flow).
 * Uses AI SDK Core generateText with executor model.
 */
export async function executeStep(
  step: PlanStep,
  currentUI: LayoutNode
): Promise<AIResponse> {
  const prompt = buildPatchModifyPrompt(currentUI, step.description, {
    isPlanStep: true,
    stepIntent: step.intent ?? "modify",
  });

  let result = await generateText({
    model: getExecutorModel(),
    prompt,
    system: SYSTEM_PROMPT,
    temperature: 0.1,
  });
  let rawResponse = result.text ?? "";

  let patchValidationResult = validatePatchResponse(rawResponse, currentUI, { rejectFullUI: true });
  // Full UI rejection: retry once with explicit patch-only instruction
  if (
    !patchValidationResult.valid &&
    patchValidationResult.errors?.some((e) =>
      e.includes("This step requires JSON Patch output only")
    )
  ) {
    const retryPrompt = buildPatchModifyPrompt(currentUI, step.description, {
      isPlanStep: true,
      stepIntent: step.intent ?? "modify",
      previousPatchError:
        `Your previous output was NOT a patch response. Output ONLY valid JSON: {"patches":[...],"explanation":"..."}. Do NOT output any object with "type"/"props"/"children" at the top level.`,
    });
    result = await generateText({
      model: getExecutorModel(),
      prompt: retryPrompt,
      system: SYSTEM_PROMPT,
      temperature: 0,
    });
    rawResponse = result.text ?? "";
    patchValidationResult = validatePatchResponse(rawResponse, currentUI, { rejectFullUI: true });
  }

  try {
    return executeStepFromRawResponse(rawResponse, step, currentUI);
  } catch (firstError) {
    // Apply failure retry: one more generate with error feedback
    const allowedTargets = getAddressableTargets(currentUI).map((t) => t.id);
    const retryErrorWithTargets =
      allowedTargets.length > 0
        ? `${firstError instanceof Error ? firstError.message : String(firstError)} Use ONLY "target" with one of these ids: ${allowedTargets.slice(0, 25).join(", ")}.`
        : String(firstError);
    const retryPrompt = buildPatchModifyPrompt(currentUI, step.description, {
      isPlanStep: true,
      stepIntent: step.intent ?? "modify",
      previousPatchError: retryErrorWithTargets,
    });
    const retryResult = await generateText({
      model: getExecutorModel(),
      prompt: retryPrompt,
      system: SYSTEM_PROMPT,
      temperature: 0.1,
    });
    const retryRawResponse = retryResult.text ?? "";
    return executeStepFromRawResponse(retryRawResponse, step, currentUI);
  }
}

/**
 * Apply recovery decision
 * 
 * Executor only applies the decision - no validation, no interpretation.
 * Recovery must return safe, validated artifacts. Executor trusts them.
 * This is the "motor" part - just execute what recovery decided.
 */
function applyRecoveryDecision(
  decision: import("./recovery").RecoveryResult
): {
  action: "retry" | "adjust_plan" | "skip" | "abort";
  updatedUI?: LayoutNode;
  updatedPlan?: Plan;
  error?: string;
} {
  if (!decision.success) {
    return {
      action: "abort",
      error: decision.error || "Recovery failed",
    };
  }

  // Explicit action mapping - no inference, no validation
  switch (decision.strategy) {
    case "retry":
      if (decision.updatedUI) {
        // Recovery returned validated UI - trust it
        return {
          action: "retry",
          updatedUI: decision.updatedUI,
        };
      }
      // Recovery said retry but didn't provide UI - abort
      return {
        action: "abort",
        error: "Recovery strategy 'retry' but no updatedUI provided",
      };

    case "adjust_plan":
      if (decision.updatedPlan) {
        // Recovery returned adjusted plan - trust it
        return {
          action: "adjust_plan",
          updatedPlan: decision.updatedPlan,
        };
      }
      // Recovery said adjust_plan but didn't provide plan - abort
      return {
        action: "abort",
        error: "Recovery strategy 'adjust_plan' but no updatedPlan provided",
      };

    case "skip_step":
      return {
        action: "skip",
      };

    case "abort":
    default:
      return {
        action: "abort",
        error: decision.error || "Recovery aborted",
      };
  }
}

/** Count Card components in the UI tree */
function countCardsInUI(node: any): number {
  if (!node || typeof node !== "object") return 0;
  let n = 0;
  if (node.type === "component") {
    const comp = node.props?.component ?? node.props?.componentName;
    if (comp === "Card") n++;
  }
  if (Array.isArray(node.children)) {
    for (const c of node.children) {
      if (typeof c === "object" && c !== null) n += countCardsInUI(c);
    }
  }
  return n;
}

/** If step description says "add all N" or "N plan cards", return N; else null */
function getExpectedAddCountFromStep(description: string): number | null {
  if (!description || typeof description !== "string") return null;
  const lower = description.toLowerCase();
  const addAllMatch = lower.match(/add\s+all\s+(\d+)/);
  if (addAllMatch) return parseInt(addAllMatch[1], 10);
  const nPlansMatch = lower.match(/(\d+)\s*(?:plan\s*cards?|cards?|plans?)/);
  if (nPlansMatch) return parseInt(nPlansMatch[1], 10);
  return null;
}

/**
 * Light per-step validation: schema only (used inside executePlan loop).
 * Heavy validation (renderability, design rules) runs once at end of plan.
 */
function validateStepResultLight(
  stepIndex: number,
  ui: LayoutNode
): StepValidationResult {
  const schemaValidation = validateLayoutNodeDirect(ui);
  const schemaValid = schemaValidation.valid;
  const schemaErrors = schemaValidation.errors;
  const status: "pass" | "fail" = schemaValid ? "pass" : "fail";
  const reason = !schemaValid
    ? `Schema validation failed: ${schemaErrors?.join(", ") || "Unknown error"}`
    : undefined;
  return {
    stepIndex,
    status,
    reason,
    schemaValid,
    renderValid: true,
    schemaErrors,
    renderErrors: undefined,
  };
}

/**
 * Post-step validation (full: schema + render).
 * Used for final UI after all steps, or by recovery.
 */
function validateStepResult(
  stepIndex: number,
  ui: LayoutNode
): StepValidationResult {
  // Schema validation
  const schemaValidation = validateLayoutNodeDirect(ui);
  const schemaValid = schemaValidation.valid;
  const schemaErrors = schemaValidation.errors;

  // Render validation (only if schema passes)
  let renderValid = false;
  let renderErrors: string[] = [];

  if (schemaValid) {
    try {
      // Check renderability using structural checks
      const renderability = checkRenderability(ui);
      
      if (renderability.renderable) {
        renderValid = true;
      } else {
        renderValid = false;
        renderErrors = renderability.errors;
      }
    } catch (renderError) {
      // Renderability check failed
      renderValid = false;
      renderErrors = [
        `Renderability check failed: ${renderError instanceof Error ? renderError.message : String(renderError)}`
      ];
    }
  } else {
    // Skip render validation if schema validation failed
    renderValid = false;
    renderErrors = ["Schema validation failed, skipping render validation"];
  }

  // Produce validation result
  const overallStatus: "pass" | "fail" = (schemaValid && renderValid) ? "pass" : "fail";
  
  let reason: string | undefined;
  if (overallStatus === "fail") {
    const reasons: string[] = [];
    if (!schemaValid) {
      reasons.push(`Schema validation failed: ${schemaErrors?.join(", ") || "Unknown error"}`);
    }
    if (!renderValid) {
      reasons.push(`Render validation failed: ${renderErrors.join(", ")}`);
    }
    reason = reasons.join("; ");
  }

  return {
    stepIndex,
    status: overallStatus,
    reason,
    schemaValid,
    renderValid,
    schemaErrors,
    renderErrors: renderErrors.length > 0 ? renderErrors : undefined,
  };
}

/**
 * Execute a plan sequentially
 * 
 * Sequential execution of planned steps with recovery logic
 * 
 * This function:
 * - Accepts ordered PlanStep[] and current UI state
 * - Loops through steps sequentially (no parallel execution)
 * - Updates UI state after every successful step
 * - Attempts recovery on failure (retry or adjust plan)
 * 
 * Important rules:
 * - No parallel execution
 * - No skipping steps (unless recovery adjusts plan)
 * - Each step builds on the previous one
 * - Errors trigger recovery attempts
 * 
 * @param plan - The plan with ordered steps to execute
 * @param initialUI - The initial UI state
 * @param originalGoal - The original goal (for plan regeneration if needed)
 * @param retryPolicy - Retry policy configuration (optional)
 * @returns PlanExecutionResult with final UI and execution status
 */
export async function executePlan(
  plan: Plan,
  initialUI: LayoutNode,
  originalGoal?: string,
  retryPolicy: RetryPolicy = DEFAULT_RETRY_POLICY
): Promise<PlanExecutionResult> {
  // Validate initial UI
  const initialValidation = validateLayoutNodeDirect(initialUI);
  if (!initialValidation.valid) {
    throw new Error(
      `Invalid initial UI structure: ${initialValidation.errors?.join(", ") || "Unknown validation error"}`
    );
  }

  // Track current UI state (evolves with each step)
  let currentUI: LayoutNode = initialUI;
  let stepsExecuted = 0;
  let currentPlan = plan; // Plan may be adjusted during recovery
  const originalTotalSteps = plan.steps.length;
  
  // Track validation results for each step
  const validationResults: StepValidationResult[] = [];
  
  // Track recovery state
  let recoveryAttempted = false;
  let recoveryStrategy: "retry" | "adjust_plan" | "skip_step" | "abort" | undefined;
  let planAdjustmentCount = 0;
  
  // Track consecutive failures for stop condition
  let consecutiveFailures = 0;
  
  // Track retries per intent type
  let retryTracking: RetryTracking = {
    byIntent: {},
    total: 0,
  };

  // Pipelining: prefetch next step while processing current (disable after failure/recovery)
  let nextPromise: Promise<AIResponse> | null = null;
  let nextStepStartTime: number | null = null;

  const executePlanStart = performance.now();
  resetExecutorTelemetry();

  const endTelemetry = (): void => {
    setTotalMs(performance.now() - executePlanStart);
    setStepsCount(stepsExecuted);
    setRetriesCount(retryTracking.total);
    setReplansCount(planAdjustmentCount);
    logExecutorSummary(getExecutorTelemetry());
  };

  let i = 0;
  while (i < currentPlan.steps.length) {
    const step = currentPlan.steps[i];
    const totalSteps = currentPlan.steps.length;

    try {
      let result: AIResponse;
      const stepStartTime = nextStepStartTime ?? Date.now();

      if (nextPromise != null) {
        console.log(`[EXECUTOR] Awaiting prefetched step ${i + 1}/${totalSteps}`);
        result = await nextPromise;
        nextPromise = null;
        nextStepStartTime = null;
      } else {
        console.log(`[EXECUTOR] Executing step ${i + 1}/${totalSteps}: ${step.description} (intent: ${step.intent})`);
        result = await executeStep(step, currentUI);
      }

      const stepExecutionTime = Date.now() - stepStartTime;
      addExecutorStepMs(stepExecutionTime);
      console.log(`[EXECUTOR] Step ${i + 1} execution completed in ${stepExecutionTime}ms`);

      // Post-step validation (schema only; render + design rules run once at end of plan)
      let stepValidation = validateStepResultLight(i, result.ui);

      // If step asked for "add all N" items but we got fewer, treat as failure so recovery can retry with count hint
      const expectedCount = getExpectedAddCountFromStep(step.description);
      if (
        stepValidation.status === "pass" &&
        expectedCount != null &&
        expectedCount >= 2
      ) {
        const actualCards = countCardsInUI(result.ui);
        if (actualCards < expectedCount) {
          const countReason = `Step asked for ${expectedCount} plan/card(s) but only ${actualCards} were added. Output exactly ${expectedCount} separate "add" patches, one per item (e.g. Basic, Pro, Enterprise).`;
          stepValidation = {
            stepIndex: i,
            status: "fail",
            reason: countReason,
            schemaValid: true,
            renderValid: true,
            schemaErrors: [countReason],
            renderErrors: undefined,
          };
        }
      }

      validationResults.push(stepValidation);

      // Handle failure (validation or exception) - unified path
      if (stepValidation.status === "fail") {
        nextPromise = null;
        nextStepStartTime = null;
        consecutiveFailures++;
        
        // AUTHORITATIVE: Check stop conditions BEFORE any recovery
        const stopContext: StopConditionContext = {
          currentUI,
          originalGoal: originalGoal || "",
          currentPlan,
          stepsExecuted,
          originalTotalSteps,
          planAdjustmentCount,
          validationResults,
          hasValidationFailures: true,
          retryTracking,
          currentStepIntent: step.intent,
        };
        
        // Check if retry is allowed for this intent
        if (!isRetryAllowed(step.intent, retryTracking)) {
          console.error(`[EXECUTOR] Retry limit reached for intent "${step.intent}"`);
          endTelemetry();
          return {
            success: false,
            finalUI: currentUI,
            stepsExecuted,
            totalSteps: originalTotalSteps,
            error: `Maximum retry limit reached for intent "${step.intent}"`,
            failedStep: step,
            failedStepIndex: i,
            validationResults,
            recoveryAttempted: recoveryAttempted || undefined,
            recoveryStrategy: recoveryStrategy,
          };
        }
        
        const stopCheck = checkStopConditions(stopContext);
        if (stopCheck.shouldStop) {
          console.log(`[EXECUTOR] Stop condition met before recovery: ${stopCheck.reason}`);
          endTelemetry();
          return {
            success: stopCheck.stopType !== "validation_failure",
            finalUI: currentUI,
            stepsExecuted,
            totalSteps: originalTotalSteps,
            error: stopCheck.reason,
            failedStep: step,
            failedStepIndex: i,
            validationResults,
            recoveryAttempted: recoveryAttempted || undefined,
            recoveryStrategy: recoveryStrategy,
          };
        }
        
        if (shouldStopOnValidationFailure(validationResults, consecutiveFailures)) {
          console.error(`[EXECUTOR] Too many consecutive validation failures, stopping execution`);
          endTelemetry();
          return {
            success: false,
            finalUI: currentUI,
            stepsExecuted,
            totalSteps: originalTotalSteps,
            error: `Too many consecutive validation failures (${consecutiveFailures})`,
            failedStep: step,
            failedStepIndex: i,
            validationResults,
            recoveryAttempted: recoveryAttempted || undefined,
            recoveryStrategy: recoveryStrategy,
          };
        }

        // Try auto-fix for trivial schema/structure errors before LLM recovery
        const fixedUI = autoFixTrivialErrors(result.ui, stepValidation.schemaErrors);
        if (fixedUI != null && validateLayoutNodeDirect(fixedUI).valid) {
          console.log(`[EXECUTOR] Auto-fix applied for step ${i + 1}, continuing without LLM retry`);
          currentUI = ensureFlexRoot(fixedUI);
          stepsExecuted++;
          consecutiveFailures = 0;
          validationResults[validationResults.length - 1] = {
            stepIndex: i,
            status: "pass",
            schemaValid: true,
            renderValid: true,
          };
          i++;
          continue;
        }

        // ONE recovery call per failure (recovery tracks retry count internally)
        console.log(`[EXECUTOR] Step ${i + 1}/${totalSteps} failed, attempting recovery...`);
        const validationResultForRecovery: import("./validator").ValidationResult = {
          valid: false,
          errors: stepValidation.schemaErrors || stepValidation.renderErrors || [stepValidation.reason || "Unknown validation error"],
        };

        // Note: We don't have rawResponse here from stepValidation, but recovery will handle JSON fixer
        // if it's a parse error from the original step execution
        // Note: rawResponse not available from stepValidation (it's post-step validation)
        // JSON fixer will be attempted during retry if parse error is detected
        const recoveryDecision = await attemptRecovery(
          step,
          i,
          currentUI,
          stepValidation,
          currentPlan,
          originalGoal || step.description,
          0,
          planAdjustmentCount,
          retryPolicy,
          validationResultForRecovery,
          undefined,
        );

        recoveryAttempted = true;
        recoveryStrategy = recoveryDecision.strategy;

        // Apply recovery decision (explicit action, no inference)
        const applied = applyRecoveryDecision(recoveryDecision);
        
        // Execute explicit action - no inference, no guessing
        switch (applied.action) {
          case "retry":
            if (!applied.updatedUI) {
              endTelemetry();
              return {
                success: false,
                finalUI: currentUI,
                stepsExecuted,
                totalSteps: originalTotalSteps,
                error: applied.error || "Recovery retry action but no UI provided",
                failedStep: step,
                failedStepIndex: i,
                validationResults,
                recoveryAttempted: true,
                recoveryStrategy: recoveryDecision.strategy,
              };
            }
            // Recovery returned validated UI - trust it, no re-validation
            // SAFE STATE UPDATE: Only update UI state after successful recovery with validated UI
            console.log(`[EXECUTOR] Updating UI state after successful retry recovery (step ${i + 1})`);
            currentUI = applied.updatedUI;
            stepsExecuted++;
            consecutiveFailures = 0;
            // Increment retry tracking
            retryTracking = incrementRetryCount(step.intent, retryTracking);
            // Update validation result to reflect successful recovery
            validationResults[validationResults.length - 1] = {
              stepIndex: i,
              status: "pass",
              schemaValid: true,
              renderValid: true,
            };
            break;

          case "adjust_plan":
            if (!applied.updatedPlan) {
              endTelemetry();
              return {
                success: false,
                finalUI: currentUI,
                stepsExecuted,
                totalSteps: originalTotalSteps,
                error: applied.error || "Recovery adjust_plan action but no plan provided",
                failedStep: step,
                failedStepIndex: i,
                validationResults,
                recoveryAttempted: true,
                recoveryStrategy: recoveryDecision.strategy,
              };
            }
            // Recovery returned adjusted plan - trust it
            currentPlan = applied.updatedPlan;
            planAdjustmentCount++;
            consecutiveFailures = 0;
            break;

          case "skip":
            // Skip this step, continue to next
            break;

          case "abort":
            endTelemetry();
            return {
              success: false,
              finalUI: currentUI,
              stepsExecuted,
              totalSteps: originalTotalSteps,
              error: applied.error || recoveryDecision.error || "Recovery aborted",
              failedStep: step,
              failedStepIndex: i,
              validationResults,
              recoveryAttempted: true,
              recoveryStrategy: recoveryDecision.strategy,
            };
        }

        // Check stop conditions after recovery (unified check)
        const postRecoveryStopContext: StopConditionContext = {
          currentUI,
          originalGoal: originalGoal || "",
          currentPlan,
          stepsExecuted,
          originalTotalSteps,
          planAdjustmentCount,
          validationResults,
          hasValidationFailures: validationResults.some(r => r.status === "fail"),
          retryTracking,
          currentStepIntent: step.intent,
        };
        
        const postRecoveryStopCheck = checkStopConditions(postRecoveryStopContext);
        if (postRecoveryStopCheck.shouldStop) {
          console.log(`[EXECUTOR] Stop condition met after recovery: ${postRecoveryStopCheck.reason}`);
          endTelemetry();
          return {
            success: postRecoveryStopCheck.stopType !== "validation_failure",
            finalUI: currentUI,
            stepsExecuted,
            totalSteps: originalTotalSteps,
            validationResults,
            recoveryAttempted: true,
            recoveryStrategy: recoveryDecision.strategy,
          };
        }

        // Continue to next step (all actions except abort continue)
        nextPromise = null;
        nextStepStartTime = null;
        i++;
        continue;
      }

      // SAFE STATE UPDATE: Only update UI state after successful validation
      console.log(`[EXECUTOR] Step ${i + 1}/${totalSteps} completed successfully (schema: ${stepValidation.schemaValid ? "pass" : "fail"})`);
      console.log(`[EXECUTOR] Updating UI state after successful step execution (step ${i + 1})`);
      currentUI = result.ui;
      stepsExecuted++;
      consecutiveFailures = 0;

      // Pipelining: prefetch next step while we do stop checks (no failure/recovery this iteration)
      if (i + 1 < currentPlan.steps.length) {
        const nextStep = currentPlan.steps[i + 1];
        nextPromise = executeStep(nextStep, currentUI);
        nextStepStartTime = Date.now();
        console.log(`[EXECUTOR] Prefetching step ${i + 2}/${totalSteps}`);
      }

      // Check stop conditions after successful step
      const stopContext: StopConditionContext = {
        currentUI,
        originalGoal: originalGoal || "",
        currentPlan,
        stepsExecuted,
        originalTotalSteps,
        planAdjustmentCount,
        validationResults,
        hasValidationFailures: validationResults.some(r => r.status === "fail"),
        retryTracking,
        currentStepIntent: step.intent,
      };
      
      const stopCheck = checkStopConditions(stopContext);
      if (stopCheck.shouldStop) {
        console.log(`[EXECUTOR] Stop condition met: ${stopCheck.reason} (type: ${stopCheck.stopType})`);
        endTelemetry();
        return {
          success: stopCheck.stopType !== "validation_failure",
          finalUI: currentUI,
          stepsExecuted,
          totalSteps: originalTotalSteps,
          error: stopCheck.stopType === "validation_failure" ? stopCheck.reason : undefined,
          validationResults,
          recoveryAttempted: recoveryAttempted || undefined,
          recoveryStrategy: recoveryStrategy,
        };
      }
      
      i++; // Move to next step

    } catch (error) {
      nextPromise = null;
      nextStepStartTime = null;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[EXECUTOR] Step ${i + 1}/${totalSteps} failed with exception: ${errorMessage}`);

      const validationErrors = (error as any).validationErrors;

      // Create validation result for failed step (same structure as validation failure)
      const stepValidation: StepValidationResult = {
        stepIndex: i,
        status: "fail",
        reason: errorMessage,
        schemaValid: false,
        renderValid: false,
        schemaErrors: validationErrors || [errorMessage],
      };
      validationResults.push(stepValidation);
      consecutiveFailures++;

      // Same recovery path as validation failure (unified)
      // AUTHORITATIVE: Check stop conditions BEFORE any recovery
      const exceptionStopContext: StopConditionContext = {
        currentUI,
        originalGoal: originalGoal || "",
        currentPlan,
        stepsExecuted,
        originalTotalSteps,
        planAdjustmentCount,
        validationResults,
        hasValidationFailures: true,
        retryTracking,
        currentStepIntent: step.intent,
      };
      
      // Check if retry is allowed for this intent
      if (!isRetryAllowed(step.intent, retryTracking)) {
        console.error(`[EXECUTOR] Retry limit reached for intent "${step.intent}" (exception path)`);
        endTelemetry();
        return {
          success: false,
          finalUI: currentUI,
          stepsExecuted,
          totalSteps: originalTotalSteps,
          error: `Maximum retry limit reached for intent "${step.intent}"`,
          failedStep: step,
          failedStepIndex: i,
          validationResults,
          recoveryAttempted: recoveryAttempted || undefined,
          recoveryStrategy: recoveryStrategy,
        };
      }
      
      const exceptionStopCheck = checkStopConditions(exceptionStopContext);
      if (exceptionStopCheck.shouldStop) {
        console.log(`[EXECUTOR] Stop condition met before recovery: ${exceptionStopCheck.reason}`);
        endTelemetry();
        return {
          success: exceptionStopCheck.stopType !== "validation_failure",
          finalUI: currentUI,
          stepsExecuted,
          totalSteps: originalTotalSteps,
          error: exceptionStopCheck.reason,
          failedStep: step,
          failedStepIndex: i,
          validationResults,
          recoveryAttempted: recoveryAttempted || undefined,
          recoveryStrategy: recoveryStrategy,
        };
      }

      if (shouldStopOnValidationFailure(validationResults, consecutiveFailures)) {
        console.error(`[EXECUTOR] Too many consecutive validation failures, stopping execution`);
        endTelemetry();
        return {
          success: false,
          finalUI: currentUI,
          stepsExecuted,
          totalSteps: originalTotalSteps,
          error: `Too many consecutive validation failures (${consecutiveFailures})`,
          failedStep: step,
          failedStepIndex: i,
          validationResults,
          recoveryAttempted: recoveryAttempted || undefined,
          recoveryStrategy: recoveryStrategy,
        };
      }

      // ONE recovery call per failure (same as validation failure path)
      console.log(`[EXECUTOR] Step ${i + 1}/${totalSteps} failed, attempting recovery...`);
      const validationResultForRecovery: import("./validator").ValidationResult = {
        valid: false,
        errors: validationErrors || [errorMessage],
        rawParsed: (error as any).failureResponse?.rawParsed,
      };

      // Extract raw response from error if available (for JSON fixer)
      const rawResponseFromError = (error as any).rawResponse || 
                                   (error as any).failureResponse?.rawResponsePreview;

      const recoveryDecision = await attemptRecovery(
        step,
        i,
        currentUI,
        stepValidation,
        currentPlan,
        originalGoal || step.description,
        0,
        planAdjustmentCount,
        retryPolicy,
        validationResultForRecovery,
        rawResponseFromError,
      );

      recoveryAttempted = true;
      recoveryStrategy = recoveryDecision.strategy;

      // Apply recovery decision (explicit action, no inference)
      const applied = applyRecoveryDecision(recoveryDecision);
      
      // Execute explicit action - no inference, no guessing
      switch (applied.action) {
        case "retry":
          if (!applied.updatedUI) {
            endTelemetry();
            return {
              success: false,
              finalUI: currentUI,
              stepsExecuted,
              totalSteps: originalTotalSteps,
              error: applied.error || "Recovery retry action but no UI provided",
              failedStep: step,
              failedStepIndex: i,
              validationResults,
              recoveryAttempted: true,
              recoveryStrategy: recoveryDecision.strategy,
            };
          }
          // Recovery returned validated UI - trust it, no re-validation
          // SAFE STATE UPDATE: Only update UI state after successful recovery with validated UI
          console.log(`[EXECUTOR] Updating UI state after successful retry recovery (exception path, step ${i + 1})`);
          currentUI = applied.updatedUI;
          stepsExecuted++;
          consecutiveFailures = 0;
          // Increment retry tracking
          retryTracking = incrementRetryCount(step.intent, retryTracking);
          // Update validation result to reflect successful recovery
          validationResults[validationResults.length - 1] = {
            stepIndex: i,
            status: "pass",
            schemaValid: true,
            renderValid: true,
          };
          break;

        case "adjust_plan":
          if (!applied.updatedPlan) {
            endTelemetry();
            return {
              success: false,
              finalUI: currentUI,
              stepsExecuted,
              totalSteps: originalTotalSteps,
              error: applied.error || "Recovery adjust_plan action but no plan provided",
              failedStep: step,
              failedStepIndex: i,
              validationResults,
              recoveryAttempted: true,
              recoveryStrategy: recoveryDecision.strategy,
            };
          }
          // Recovery returned adjusted plan - trust it
          currentPlan = applied.updatedPlan;
          planAdjustmentCount++;
          consecutiveFailures = 0;
          break;

        case "skip":
          // Skip this step, continue to next
          break;

        case "abort":
          endTelemetry();
          return {
            success: false,
            finalUI: currentUI,
            stepsExecuted,
            totalSteps: originalTotalSteps,
            error: applied.error || recoveryDecision.error || errorMessage,
            failedStep: step,
            failedStepIndex: i,
            validationResults,
            recoveryAttempted: true,
            recoveryStrategy: recoveryDecision.strategy,
          };
      }

      // Check stop conditions after recovery (unified check)
      const postRecoveryStopContext: StopConditionContext = {
        currentUI,
        originalGoal: originalGoal || "",
        currentPlan,
        stepsExecuted,
        originalTotalSteps,
        planAdjustmentCount,
        validationResults,
        hasValidationFailures: validationResults.some(r => r.status === "fail"),
        retryTracking,
        currentStepIntent: step.intent,
      };
      
      const postRecoveryStopCheck = checkStopConditions(postRecoveryStopContext);
      if (postRecoveryStopCheck.shouldStop) {
        console.log(`[EXECUTOR] Stop condition met after recovery: ${postRecoveryStopCheck.reason}`);
        endTelemetry();
        return {
          success: postRecoveryStopCheck.stopType !== "validation_failure",
          finalUI: currentUI,
          stepsExecuted,
          totalSteps: originalTotalSteps,
          validationResults,
          recoveryAttempted: true,
          recoveryStrategy: recoveryDecision.strategy,
        };
      }

      // Continue to next step (all actions except abort continue)
      i++;
      continue;
    }
  }

  // All steps executed successfully — run heavy validation once (renderability + design rules)
  let renderOk = true;
  let designRulesOk = true;
  try {
    const renderability = checkRenderability(currentUI);
    if (!renderability.renderable) {
      renderOk = false;
      console.warn(`[EXECUTOR] Final UI renderability check failed: ${renderability.errors?.join(", ")}`);
    }
    if (renderOk) {
      const designEval = evaluateAllRules(currentUI);
      if (!designEval.passed) {
        designRulesOk = false;
        console.warn(`[EXECUTOR] Final UI design rule violations: ${formatViolations(designEval).join("; ")}`);
      }
    }
  } catch (e) {
    console.warn(`[EXECUTOR] Final validation error: ${e instanceof Error ? e.message : String(e)}`);
    renderOk = false;
  }
  // Return success either way; we do not re-run per-step retries (partial success with warning)
  if (!renderOk || !designRulesOk) {
    console.log(`[EXECUTOR] Plan completed with final validation warnings (render: ${renderOk}, design rules: ${designRulesOk})`);
  }

  const finalStopContext: StopConditionContext = {
    currentUI,
    originalGoal: originalGoal || "",
    currentPlan,
    stepsExecuted,
    originalTotalSteps,
    planAdjustmentCount,
    validationResults,
    hasValidationFailures: validationResults.some(r => r.status === "fail"),
    retryTracking,
  };

  const finalStopCheck = checkStopConditions(finalStopContext);
  if (finalStopCheck.shouldStop && finalStopCheck.stopType !== "all_steps_complete") {
    console.log(`[EXECUTOR] Final stop condition check: ${finalStopCheck.reason}`);
  }

  endTelemetry();
  return {
    success: true,
    finalUI: currentUI,
    stepsExecuted,
    totalSteps: originalTotalSteps,
    validationResults,
    recoveryAttempted: recoveryAttempted || undefined,
    recoveryStrategy: recoveryStrategy,
  };
}
