/**
 * Failure detection and description for invalid or unsafe AI outputs
 * 
 * This module is DESCRIPTIVE ONLY - it categorizes and describes failures.
 * It does NOT decide what to do about failures (that's recovery.ts's job).
 * 
 * Failure types (structured, no guessing):
 * - Parse error (invalid JSON)
 * - Schema validation error (Zod failure)
 * - Renderability error (UI can't render)
 * - Design rule violation error
 * 
 * Key principle: Failures never update state, never call renderer.
 * This module only observes and categorizes.
 */

import type { ValidationResult } from "./validator";
import type { StepValidationResult } from "./types";

/**
 * Structured failure types with detailed metadata
 * Using discriminated unions for type safety and accurate classification
 */
export type FailureType =
  | {
      type: "parse_error";
      /** The parse error message */
      parseError: string;
      /** Raw response that failed to parse */
      rawResponse?: string;
    }
  | {
      type: "schema_validation_error";
      /** Zod validation errors */
      schemaErrors: string[];
      /** Which schema failed (AIResponseSchema or LayoutNodeSchema) */
      failedSchema: "AIResponseSchema" | "LayoutNodeSchema";
      /** Parsed JSON before validation (for debugging) */
      rawParsed?: any;
    }
  | {
      type: "renderability_error";
      /** Renderability check errors */
      renderErrors: string[];
      /** Whether schema validation passed before render check */
      schemaValid: boolean;
    }
  | {
      type: "design_rule_violation";
      /** Error-level design rule violations */
      violations: string[];
      /** Warning-level violations (informational) */
      warnings?: string[];
    }
  | {
      type: "intent_mismatch";
      /** Expected intent */
      expected: "create" | "modify";
      /** Actual intent */
      actual: string;
    }
  | {
      type: "unknown_error";
      /** Generic error message */
      message: string;
      /** Any additional context */
      context?: any;
    };

/**
 * Failure reason (simplified enum for backward compatibility and recovery decisions)
 */
export type FailureReason =
  | "json_parse_failed"
  | "schema_validation_failed"
  | "renderability_error"
  | "design_rule_violation"
  | "invalid_intent"
  | "unknown_error";


/**
 * Structured error response
 * Machine-readable error object with rich failure context
 */
export interface FailureResponse {
  /** Status indicator */
  status: "error";
  /** Machine-readable failure reason */
  reason: FailureReason;
  /** Structured failure type with detailed metadata */
  failureType: FailureType;
  /** Human-readable error message */
  message: string;
  /** Detailed error information (flattened for compatibility) */
  details: string[];
  /** Whether this failure can be retried */
  retryable: boolean;
  /** Raw parsed JSON (if available, for debugging) */
  rawParsed?: any;
  /** First 500 chars of raw response (for debugging) */
  rawResponsePreview?: string;
  /** Timestamp of failure (for diagnostics) */
  timestamp: Date;
  /** Context for retry prompt construction */
  retryContext?: {
    /** What went wrong (for LLM feedback) */
    whatWentWrong: string;
    /** Specific fields that failed validation */
    failedFields?: string[];
    /** Suggested corrections */
    suggestions?: string[];
  };
}


/**
 * Step 1: Detect failure from validation result
 * 
 * Accurately classifies failures into structured types with detailed metadata.
 * No guessing - uses explicit error patterns and validation result structure.
 */
export function detectFailure(
  validationResult: ValidationResult,
  rawResponse?: string
): { 
  isFailure: boolean; 
  reason: FailureReason; 
  failureType?: FailureType;
  details: string[] 
} {
  if (validationResult.valid) {
    return { isFailure: false, reason: "unknown_error", details: [] };
  }

  const errors = validationResult.errors || [];
  const details: string[] = [...errors];

  // Classify failure type with detailed metadata (no guessing)
  let failureType: FailureType;
  let reason: FailureReason;

  // 1. Parse error (invalid JSON) - check first
  const parseError = errors.find((e) => e.includes("Failed to parse JSON"));
  if (parseError) {
    failureType = {
      type: "parse_error",
      parseError: parseError,
      rawResponse: rawResponse ? rawResponse.substring(0, 1000) : undefined,
    };
    reason = "json_parse_failed";
    return { isFailure: true, reason, failureType, details };
  }

  // 2. Intent mismatch - explicit check
  const intentError = errors.find((e) => e.includes("Expected intent"));
  if (intentError) {
    const match = intentError.match(/Expected intent "(\w+)", got "(\w+)"/);
    failureType = {
      type: "intent_mismatch",
      expected: (match?.[1] as "create" | "modify") || "modify",
      actual: match?.[2] || "unknown",
    };
    reason = "invalid_intent";
    return { isFailure: true, reason, failureType, details };
  }

  // 3. Schema validation error - check which schema failed
  const aiResponseSchemaError = errors.find((e) => e.includes("AIResponseSchema validation failed"));
  const layoutNodeError = errors.find((e) => e.includes("LayoutNode validation failed"));
  const missingFieldError = errors.find((e) => e.includes("Missing"));

  if (aiResponseSchemaError || layoutNodeError || missingFieldError) {
    const schemaErrors = errors.filter(
      (e) => 
        e.includes("AIResponseSchema") || 
        e.includes("LayoutNode validation") || 
        e.includes("Missing")
    );
    
    let failedSchema: "AIResponseSchema" | "LayoutNodeSchema";
    if (aiResponseSchemaError) {
      failedSchema = "AIResponseSchema";
    } else {
      failedSchema = "LayoutNodeSchema";
    }

    failureType = {
      type: "schema_validation_error",
      schemaErrors,
      failedSchema,
      rawParsed: validationResult.rawParsed,
    };
    reason = "schema_validation_failed";
    return { isFailure: true, reason, failureType, details };
  }

  // 4. Design rule violations - check if present (even if validation passed)
  if (validationResult.designRuleViolations?.errors && validationResult.designRuleViolations.errors.length > 0) {
    const violationDetails = validationResult.designRuleViolations.errors;
    failureType = {
      type: "design_rule_violation",
      violations: violationDetails,
      warnings: validationResult.designRuleViolations.warnings,
    };
    reason = "design_rule_violation";
    return { isFailure: true, reason, failureType, details: violationDetails };
  }

  // 5. Renderability errors - check if render errors are present
  // Note: Render errors come from StepValidationResult, not ValidationResult
  // This is a limitation - we'll handle render errors separately in executor
  // For now, if we have errors but can't classify them, it's unknown
  if (errors.length > 0) {
    failureType = {
      type: "unknown_error",
      message: errors.join("; "),
      context: { rawParsed: validationResult.rawParsed },
    };
    reason = "unknown_error";
    return { isFailure: true, reason, failureType, details };
  }

  // Fallback: unknown error
  failureType = {
    type: "unknown_error",
    message: "Unknown validation error",
    context: { validationResult },
  };
  reason = "unknown_error";
  return { isFailure: true, reason, failureType, details };
}


/**
 * Step 2: Create structured error response
 * 
 * Generates a machine-readable error JSON with rich failure context.
 * This is NOT UI JSON - it's system feedback with diagnostics.
 * 
 * Note: The retryable flag is informational only.
 * Recovery logic (recovery.ts) decides whether to actually retry.
 */
export function createErrorResponse(
  reason: FailureReason,
  failureType: FailureType,
  details: string[],
  rawResponse?: string,
  rawParsed?: any
): FailureResponse {
  // Human-readable messages for each failure reason
  const messages: Record<FailureReason, string> = {
    json_parse_failed: "Failed to parse JSON response from AI model",
    schema_validation_failed: "AI response does not match required schema",
    renderability_error: "UI structure cannot be rendered",
    design_rule_violation: "Design rule violations detected",
    invalid_intent: "AI response has incorrect intent",
    unknown_error: "An unknown error occurred during validation",
  };

  // Determine if failure is potentially retryable (informational only)
  const retryableReasons: FailureReason[] = [
    "schema_validation_failed",
    "renderability_error",
    "design_rule_violation",
    "unknown_error",
  ];

  // Build retry context for prompt construction
  const retryContext = buildRetryContext(failureType, details);

  // Log failure context for diagnostics
  logFailureContext(reason, failureType, details);

  return {
    status: "error",
    reason,
    failureType,
    message: messages[reason] || messages.unknown_error,
    details,
    retryable: retryableReasons.includes(reason),
    rawParsed,
    rawResponsePreview: rawResponse ? rawResponse.substring(0, 500) : undefined,
    timestamp: new Date(),
    retryContext,
  };
}

/**
 * Build retry context from failure type
 * Provides structured information for retry prompt construction
 */
function buildRetryContext(
  failureType: FailureType,
  details: string[]
): FailureResponse["retryContext"] {
  switch (failureType.type) {
    case "parse_error":
      return {
        whatWentWrong: "The response was not valid JSON",
        suggestions: [
          "Ensure the response is valid JSON",
          "Check for unclosed brackets or quotes",
          "Remove any markdown code fences if present",
        ],
      };

    case "schema_validation_error":
      const failedFields = extractFailedFields(failureType.schemaErrors);
      return {
        whatWentWrong: `${failureType.failedSchema} validation failed`,
        failedFields,
        suggestions: [
          `Ensure all required fields are present for ${failureType.failedSchema}`,
          "Check field types match the schema",
          "Verify nested structures match the expected format",
        ],
      };

    case "renderability_error":
      return {
        whatWentWrong: "The UI structure cannot be rendered",
        suggestions: [
          "Ensure all components are valid and registered",
          "Check that layout structures are correct",
          "Verify component props match expected format",
        ],
      };

    case "design_rule_violation":
      return {
        whatWentWrong: "Design rule violations detected",
        suggestions: [
          "Review the design rule violations",
          "Adjust component usage to comply with rules",
          "Consider alternative UI patterns",
        ],
      };

    case "intent_mismatch":
      return {
        whatWentWrong: `Expected intent "${failureType.expected}" but got "${failureType.actual}"`,
        suggestions: [
          `Ensure the response intent is "${failureType.expected}"`,
          "Check the intent field in the response",
        ],
      };

    case "unknown_error":
      return {
        whatWentWrong: failureType.message,
        suggestions: ["Review the error details", "Check the validation output"],
      };
  }
}

/**
 * Extract failed field names from schema errors
 */
function extractFailedFields(schemaErrors: string[]): string[] {
  const fields: string[] = [];
  for (const error of schemaErrors) {
    // Try to extract field names from Zod errors
    // Pattern: "field_name: error message" or "field_name at path"
    const fieldMatch = error.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (fieldMatch) {
      fields.push(fieldMatch[1]);
    }
    // Also check for path-based errors: "path.to.field: error"
    const pathMatch = error.match(/([a-zA-Z_][a-zA-Z0-9_.]+):/);
    if (pathMatch && !fields.includes(pathMatch[1])) {
      fields.push(pathMatch[1]);
    }
  }
  return [...new Set(fields)]; // Remove duplicates
}

/**
 * Log failure context for diagnostics
 */
function logFailureContext(
  reason: FailureReason,
  failureType: FailureType,
  details: string[]
): void {
  console.error(`[FAILURE] ${reason}:`, {
    type: failureType.type,
    details: details.slice(0, 5), // Limit to first 5 errors
    timestamp: new Date().toISOString(),
  });

  // Log specific context based on failure type
  switch (failureType.type) {
    case "parse_error":
      console.error(`[FAILURE] Parse error: ${failureType.parseError}`);
      break;
    case "schema_validation_error":
      console.error(`[FAILURE] Schema validation failed (${failureType.failedSchema}):`, 
        failureType.schemaErrors.slice(0, 3));
      break;
    case "renderability_error":
      console.error(`[FAILURE] Renderability errors:`, failureType.renderErrors.slice(0, 3));
      break;
    case "design_rule_violation":
      console.error(`[FAILURE] Design rule violations:`, failureType.violations.slice(0, 3));
      break;
    case "intent_mismatch":
      console.error(`[FAILURE] Intent mismatch: expected "${failureType.expected}", got "${failureType.actual}"`);
      break;
  }
}


/**
 * Detect failure from StepValidationResult (includes renderability errors)
 * 
 * This is used when we have post-step validation results that include
 * renderability checks, not just schema validation.
 */
export function detectFailureFromStepValidation(
  stepValidation: StepValidationResult
): {
  isFailure: boolean;
  reason: FailureReason;
  failureType?: FailureType;
  details: string[];
} {
  if (stepValidation.status === "pass") {
    return { isFailure: false, reason: "unknown_error", details: [] };
  }

  const details: string[] = [];
  let failureType: FailureType;

  // Check renderability errors first (most specific)
  if (!stepValidation.renderValid && stepValidation.renderErrors && stepValidation.renderErrors.length > 0) {
    failureType = {
      type: "renderability_error",
      renderErrors: stepValidation.renderErrors,
      schemaValid: stepValidation.schemaValid,
    };
    details.push(...stepValidation.renderErrors);
    return {
      isFailure: true,
      reason: "renderability_error",
      failureType,
      details,
    };
  }

  // Check schema errors
  if (!stepValidation.schemaValid && stepValidation.schemaErrors && stepValidation.schemaErrors.length > 0) {
    failureType = {
      type: "schema_validation_error",
      schemaErrors: stepValidation.schemaErrors,
      failedSchema: "LayoutNodeSchema", // Step validation is always LayoutNode
    };
    details.push(...stepValidation.schemaErrors);
    return {
      isFailure: true,
      reason: "schema_validation_failed",
      failureType,
      details,
    };
  }

  // Fallback to reason from stepValidation
  failureType = {
    type: "unknown_error",
    message: stepValidation.reason || "Unknown validation error",
  };
  details.push(stepValidation.reason || "Unknown validation error");

  return {
    isFailure: true,
    reason: "unknown_error",
    failureType,
    details,
  };
}

/**
 * Check if a failure is retryable
 */
export function isRetryable(reason: FailureReason): boolean {
  const retryableReasons: FailureReason[] = [
    "schema_validation_failed",
    "renderability_error",
    "design_rule_violation",
    "unknown_error",
  ];
  return retryableReasons.includes(reason);
}
