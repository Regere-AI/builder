/**
 * Define Stop Conditions (Goal Satisfied)
 * 
 * Defines when the agent should stop acting and declare the task complete.
 * It is the final control mechanism of the agent loop.
 * 
 * Stop conditions prevent infinite loops and give the agent self-awareness of completion.
 */

import type { Plan, StepValidationResult } from "./types";
import type { LayoutNode } from "../../shared/schema";

/**
 * Hard safety limits
 * 
 * To prevent infinite loops:
 * - Max number of steps
 * - Max replans
 * - Max retries per step (handled by retry policy)
 * - Max retries per intent type
 */
export const STOP_LIMITS = {
  /** Maximum total steps that can be executed across all plans */
  MAX_STEPS: 10,
  /** Maximum number of plan adjustments/replans */
  MAX_REPLANS: 1,
  /** Maximum retries per intent type (tightened to cap retry explosion) */
  MAX_RETRIES_BY_INTENT: {
    create: 2,
    modify: 1,
    add: 1,
    remove: 1,
  } as const,
} as const;

/**
 * Stop condition result
 */
export interface StopConditionResult {
  /** Whether stop conditions are met */
  shouldStop: boolean;
  /** Reason for stopping (if applicable) */
  reason?: string;
  /** Type of stop condition met */
  stopType?: "goal_satisfied" | "all_steps_complete" | "safety_limit" | "validation_failure";
}

/**
 * Retry tracking per intent type
 */
export interface RetryTracking {
  /** Retry count per intent type */
  byIntent: {
    create?: number;
    modify?: number;
    add?: number;
    remove?: number;
  };
  /** Total retries across all intents */
  total: number;
}

/**
 * Execution context for stop condition checks
 */
export interface StopConditionContext {
  /** Current UI state */
  currentUI: LayoutNode;
  /** Original goal */
  originalGoal: string;
  /** Current plan */
  currentPlan: Plan;
  /** Steps executed so far */
  stepsExecuted: number;
  /** Total steps in original plan */
  originalTotalSteps: number;
  /** Number of plan adjustments made */
  planAdjustmentCount: number;
  /** Validation results for executed steps */
  validationResults: StepValidationResult[];
  /** Whether there are any validation failures */
  hasValidationFailures: boolean;
  /** Retry tracking per intent type */
  retryTracking?: RetryTracking;
  /** Current step intent (for retry limit checking) */
  currentStepIntent?: "create" | "modify" | "add" | "remove";
}

/**
 * Define what "done" means
 * 
 * Common stop signals:
 * - All planned steps executed successfully
 * - No validation failures
 * - No retries pending
 * - Goal explicitly marked as satisfied
 */
function checkCompletionConditions(context: StopConditionContext): StopConditionResult {
  // All planned steps executed successfully
  if (context.stepsExecuted >= context.currentPlan.steps.length && context.currentPlan.steps.length > 0) {
    // Check if all steps passed validation
    const allStepsPassed = context.validationResults.every(
      (result) => result.status === "pass"
    );

    if (allStepsPassed && !context.hasValidationFailures) {
      return {
        shouldStop: true,
        reason: "All planned steps executed successfully with no validation failures",
        stopType: "all_steps_complete",
      };
    }
  }

  // If no steps remain and we've executed at least one step successfully
  if (context.currentPlan.steps.length === 0 && context.stepsExecuted > 0) {
    return {
      shouldStop: true,
      reason: "No remaining steps in plan and at least one step executed successfully",
      stopType: "all_steps_complete",
    };
  }

  return {
    shouldStop: false,
  };
}

/**
 * Check hard safety limits
 */
function checkSafetyLimits(context: StopConditionContext): StopConditionResult {
  // Max steps limit
  if (context.stepsExecuted >= STOP_LIMITS.MAX_STEPS) {
    return {
      shouldStop: true,
      reason: `Maximum step limit reached (${STOP_LIMITS.MAX_STEPS} steps)`,
      stopType: "safety_limit",
    };
  }

  // Max replans limit
  if (context.planAdjustmentCount >= STOP_LIMITS.MAX_REPLANS) {
    return {
      shouldStop: true,
      reason: `Maximum replan limit reached (${STOP_LIMITS.MAX_REPLANS} replans)`,
      stopType: "safety_limit",
    };
  }

  // Max retries per intent type
  if (context.retryTracking && context.currentStepIntent) {
    const intentRetryCount = context.retryTracking.byIntent[context.currentStepIntent] || 0;
    const maxRetries = STOP_LIMITS.MAX_RETRIES_BY_INTENT[context.currentStepIntent] ?? 2;
    
    if (intentRetryCount >= maxRetries) {
      return {
        shouldStop: true,
        reason: `Maximum retry limit reached for intent "${context.currentStepIntent}" (${maxRetries} retries)`,
        stopType: "safety_limit",
      };
    }
  }

  // Total retry limit (safety net)
  if (context.retryTracking && context.retryTracking.total >= 10) {
    return {
      shouldStop: true,
      reason: `Maximum total retry limit reached (${context.retryTracking.total} total retries)`,
      stopType: "safety_limit",
    };
  }

  return {
    shouldStop: false,
  };
}

/**
 * Goal satisfaction check
 * 
 * After each successful step (or full pass):
 * Ask: "Does the current UI satisfy the goal?"
 * 
 * This is a rule-based check (early version).
 * Can be extended with lightweight LLM check later.
 */
function checkGoalSatisfaction(context: StopConditionContext): StopConditionResult {
  // Rule-based check: If goal contains completion keywords and steps executed
  const goal = context.originalGoal.toLowerCase();
  const completionKeywords = ["complete", "done", "finished", "satisfied", "achieved"];
  
  // Simple heuristic: If goal mentions completion and we've executed steps
  const mentionsCompletion = completionKeywords.some(keyword => goal.includes(keyword));
  
  // If we've executed at least one step successfully and goal seems satisfied
  if (context.stepsExecuted > 0 && !context.hasValidationFailures) {
    // Check if current plan is empty (all steps done)
    if (context.currentPlan.steps.length === 0) {
      return {
        shouldStop: true,
        reason: "Goal appears satisfied - all steps completed",
        stopType: "goal_satisfied",
      };
    }
  }

  // For now, return false (goal satisfaction requires more sophisticated checking)
  // This can be extended with LLM-based goal satisfaction check later
  return {
    shouldStop: false,
  };
}

/**
 * Main stop condition checker
 * 
 * Checks all stop conditions:
 * - Completion conditions (all steps done)
 * - Safety limits (max steps, max replans)
 * - Goal satisfaction (if applicable)
 * 
 * @param context - Execution context for stop condition checks
 * @returns StopConditionResult indicating whether to stop and why
 */
export function checkStopConditions(context: StopConditionContext): StopConditionResult {
  // Step 1: Check completion conditions (all steps done, no failures)
  const completionCheck = checkCompletionConditions(context);
  if (completionCheck.shouldStop) {
    return completionCheck;
  }

  // Step 2: Check hard safety limits (prevent infinite loops)
  const safetyCheck = checkSafetyLimits(context);
  if (safetyCheck.shouldStop) {
    return safetyCheck;
  }

  // Step 3: Check goal satisfaction (if applicable)
  const goalCheck = checkGoalSatisfaction(context);
  if (goalCheck.shouldStop) {
    return goalCheck;
  }

  // No stop conditions met - continue execution
  return {
    shouldStop: false,
  };
}

/**
 * Check if execution should stop due to validation failure
 * 
 * This is a special stop condition for critical validation failures
 * that cannot be recovered from.
 */
export function shouldStopOnValidationFailure(
  validationResults: StepValidationResult[],
  consecutiveFailures: number
): boolean {
  // Stop if we have too many consecutive failures
  const MAX_CONSECUTIVE_FAILURES = 3;
  
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    return true;
  }

  // Stop if all recent steps failed
  const recentResults = validationResults.slice(-3);
  if (recentResults.length >= 3 && recentResults.every(r => r.status === "fail")) {
    return true;
  }

  return false;
}

/**
 * Check if retry is allowed for a given intent
 * 
 * Returns true if retry is allowed, false if limit reached
 */
export function isRetryAllowed(
  intent: "create" | "modify" | "add" | "remove",
  retryTracking?: RetryTracking
): boolean {
  if (!retryTracking) {
    return true; // No tracking means allow retry
  }

  const intentRetryCount = retryTracking.byIntent[intent] || 0;
  const maxRetries = STOP_LIMITS.MAX_RETRIES_BY_INTENT[intent] ?? 2;
  return intentRetryCount < maxRetries;
}

/**
 * Increment retry count for a given intent
 */
export function incrementRetryCount(
  intent: "create" | "modify" | "add" | "remove",
  retryTracking: RetryTracking
): RetryTracking {
  const newTracking = {
    ...retryTracking,
    byIntent: {
      ...retryTracking.byIntent,
      [intent]: (retryTracking.byIntent[intent] || 0) + 1,
    },
    total: retryTracking.total + 1,
  };
  
  return newTracking;
}
