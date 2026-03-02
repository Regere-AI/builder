/**
 * Agent Orchestration Types
 * 
 * Type definitions for the agent execution pipeline
 */

import type { AIResponseParsed } from "../ai-contract/schema";
import type { LayoutNode } from "../../shared/schema";

/**
 * Execution context for agent operations
 */
export interface ExecutionContext {
  /** Current user prompt */
  prompt: string;
  /** Operation type */
  operation: "create" | "modify";
  /** Existing UI (for modify operations) */
  existingUI?: LayoutNode;
}

/**
 * Execution result
 */
export interface ExecutionResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Validated AI response (if successful) */
  response?: AIResponseParsed;
  /** Error message (if failed) */
  error?: string;
  /** Validation errors (if validation failed) */
  validationErrors?: string[];
  /** Failure response (if failed) */
  failureResponse?: import("./failure").FailureResponse;
  /** Whether a retry was attempted */
  retryAttempted?: boolean;
}

/**
 * Plan Step Type
 *
 * Represents a single step in a plan to achieve a goal.
 * Each step must be small, executable, and mappable to an existing generator.
 * - id: assigned by normalizer (step-0, step-1), not by the LLM
 * - dependsOn: step indices (0-based) that must run before this step; used for topological sort
 * - resources: optional UI areas this step touches (e.g. ["header"]); steps sharing a resource are serialized
 */
export interface PlanStep {
  /** Stable id assigned by normalizer (e.g. step-0, step-1); do not ask LLM for id */
  id: string;
  /** Human-readable description of what this step does */
  description: string;
  /** Intent of this step - modify, add (full component at place), or remove (entire component) */
  intent: "modify" | "add" | "remove";
  /** 0-based step indices that must run before this step (for execution order). Assigned from LLM dependsOnIndices in normalizer. */
  dependsOn?: number[];
  /** Optional UI resources this step touches (e.g. ["header"]); steps sharing a resource are serialized */
  resources?: string[];
}

/**
 * Plan Type
 * 
 * Represents a complete plan with ordered steps to achieve a goal.
 */
export interface Plan {
  /** Ordered list of steps to execute */
  steps: PlanStep[];
}

/**
 * Step Validation Result
 * 
 * Represents the validation result for a single execution step.
 * This is the "observe" part of the agent loop.
 */
export interface StepValidationResult {
  /** Step index (0-based) */
  stepIndex: number;
  /** Validation status */
  status: "pass" | "fail";
  /** Reason for pass/fail (if applicable) */
  reason?: string;
  /** Schema validation passed */
  schemaValid: boolean;
  /** Render validation passed */
  renderValid: boolean;
  /** Schema validation errors (if any) */
  schemaErrors?: string[];
  /** Render validation errors (if any) */
  renderErrors?: string[];
}
