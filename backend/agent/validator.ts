/**
 * Post-generation JSON validation
 * 
 * Centralized validation gate after every model output (create or modify).
 * This prevents broken UIs, runtime crashes, and silent corruption of state.
 * 
 * Validation flow:
 * 1. Extract valid JSON using robust extractor (handles malformed JSON)
 * 2. Validate against AIResponseSchema (intent, ui, explanation)
 * 3. Validate ui against LayoutNodeSchema
 * 4. Return validation signal (valid: true → continue, valid: false → block execution)
 */

import { AIResponseSchema } from "../ai-contract/schema";
import { validateLayoutNode } from "../../shared/schema";
import { postProcessAIResponse } from "../post-processor";
import { evaluateAllRules, getViolationsBySeverity, formatViolations } from "../design-rules";
import { extractStrictLayoutNode, validateStrictLayoutNode } from "../../shared/json-extractor-strict";
import {
  componentAcceptsOptions,
  getAvailableComponentNames,
  getComponentMeta,
  getDataCapabilityComponents,
  isRegisteredComponent,
} from "../../shared/componentNames";
import type { AIResponseParsed } from "../ai-contract/schema";
import type { LayoutNode } from "../../shared/schema";

/**
 * Validation result structure with detailed error metadata
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Parsed and validated response (only present if valid) */
  parsedResponse?: AIResponseParsed;
  /** Validation errors (only present if invalid) */
  errors?: string[];
  /** Raw parsed JSON before validation (for debugging) */
  rawParsed?: any;
  /** Design rule violations (advisory, doesn't block validation) */
  designRuleViolations?: {
    errors?: string[];
    warnings?: string[];
    info?: string[];
  };
  /** Detailed error metadata for failure classification */
  errorMetadata?: {
    /** Parse error details (if JSON parsing failed) */
    parseError?: {
      error: string;
      rawResponse?: string;
    };
    /** Schema validation errors (if schema validation failed) */
    schemaErrors?: {
      aiResponseSchemaErrors?: string[];
      layoutNodeErrors?: string[];
      missingFields?: string[];
    };
    /** Intent mismatch (if intent validation failed) */
    intentMismatch?: {
      expected: "create" | "modify";
      actual: string;
    };
  };
}

/**
 * Step 2 & 3: Validate against schemas
 * - AIResponseSchema (intent, ui, explanation) - but use relaxed validation for ui
 * - LayoutNodeSchema (ui structure) - with relaxed validation for children
 */
function validateSchemas(parsedResponse: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate basic AIResponse structure (intent and explanation)
  if (!parsedResponse.intent || typeof parsedResponse.intent !== 'string') {
    errors.push("Missing or invalid 'intent' field");
  } else if (!['create', 'modify'].includes(parsedResponse.intent)) {
    errors.push(`Invalid intent: ${parsedResponse.intent}. Must be 'create' or 'modify'`);
  }

  if (!parsedResponse.explanation || typeof parsedResponse.explanation !== 'string') {
    errors.push("Missing or invalid 'explanation' field");
  }

  // Validate LayoutNode (ui field) - with relaxed validation for children
  if (parsedResponse.ui) {
    // Use relaxed validation that allows string children
    const relaxedValidation = validateLayoutNodeRelaxed(parsedResponse.ui);
    if (!relaxedValidation.valid) {
      errors.push(`LayoutNode validation failed: ${relaxedValidation.errors?.join(", ")}`);
    }
  } else {
    errors.push("Missing 'ui' field in response");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate depth of a LayoutNode tree
 */
function calculateNodeDepth(node: any, currentDepth: number = 0): number {
  if (!node || typeof node !== 'object') {
    return currentDepth;
  }

  let maxDepth = currentDepth;

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if (typeof child === 'object' && child !== null) {
        const childDepth = calculateNodeDepth(child, currentDepth + 1);
        maxDepth = Math.max(maxDepth, childDepth);
      }
    }
  }

  return maxDepth;
}

/**
 * Count components in a LayoutNode tree
 */
function countNodeComponents(node: any): number {
  if (!node || typeof node !== 'object') {
    return 0;
  }

  let count = 0;

  if (node.type === 'component') {
    count = 1;
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if (typeof child === 'object' && child !== null) {
        count += countNodeComponents(child);
      }
    }
  }

  return count;
}

/**
 * Relaxed LayoutNode validation that allows string children
 * This is more practical for UI rendering where text content is common
 * Now includes depth and component count limits for complex structures
 */
function validateLayoutNodeRelaxed(node: any): { valid: boolean; errors?: string[] } {
  const errors: string[] = [];

  // Basic structure validation
  if (!node || typeof node !== 'object') {
    return { valid: false, errors: ['Node must be an object'] };
  }

  if (!node.type || typeof node.type !== 'string') {
    errors.push('Node must have a string type');
  }

  if (node.props && typeof node.props !== 'object') {
    errors.push('Props must be an object if present');
  }

  // No depth limit: nested components can be any number of levels deep

  // Validate component count (allow up to 50 components for rich layouts)
  const maxComponents = 50;
  const componentCount = countNodeComponents(node);
  if (componentCount > maxComponents) {
    errors.push(`Too many components: ${componentCount} (max ${maxComponents} allowed)`);
  }

  // Validate children - allow string, array, or null (treat null as absent)
  if (node.children !== undefined && node.children !== null) {
    if (typeof node.children === 'string') {
      // String children are allowed
    } else if (Array.isArray(node.children)) {
      // Recursively validate array children
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (typeof child === 'string') {
          // String children in arrays are allowed
          continue;
        } else if (child != null && typeof child === 'object') {
          // Recursively validate LayoutNode children
          const childValidation = validateLayoutNodeRelaxed(child);
          if (!childValidation.valid) {
            errors.push(`Child ${i}: ${childValidation.errors?.join(", ")}`);
          }
        }
        // null/undefined array slots are allowed (filtered elsewhere)
      }
    } else {
      errors.push('Children must be a string or array if present');
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}

/**
 * Main validation function for direct layout responses - STRICT VERSION
 * 
 * Uses the strict extractor to get ONLY type, props, children fields.
 * NO fallbacks, NO repetition, NO extra fields.
 * 
 * @param rawResponse - Raw string response from LLM
 * @param expectedIntent - Optional expected intent ("create" or "modify")
 * @returns ValidationResult with valid flag and parsed response or errors
 */
export function validateDirectLayoutOutput(
  rawResponse: string,
  expectedIntent?: "create" | "modify"
): ValidationResult {
  console.log(`[VALIDATOR] STRICT validation starting, content length: ${rawResponse.length}`);
  
  // Step 1: Use strict extractor to get ONLY the LayoutNode structure
  const extractionResult = extractStrictLayoutNode(rawResponse);
  
  if (!extractionResult.success) {
    console.log(`[VALIDATOR] STRICT extraction FAILED: ${extractionResult.error}`);
    console.log(`[VALIDATOR] Debug info:`, extractionResult.debugInfo);
    
    return {
      valid: false,
      errors: [`Strict extraction failed: ${extractionResult.error}`],
      rawParsed: undefined,
      errorMetadata: {
        parseError: {
          error: extractionResult.error || "Unknown extraction error",
          rawResponse: rawResponse.substring(0, 1000),
        },
      },
    };
  }

  console.log(`[VALIDATOR] STRICT extraction SUCCESS via ${extractionResult.debugInfo?.extractionMethod}`);
  console.log(`[VALIDATOR] Extracted LayoutNode:`, {
    type: extractionResult.layoutNode!.type,
    hasProps: !!extractionResult.layoutNode!.props,
    childrenType: Array.isArray(extractionResult.layoutNode!.children) ? 'array' : typeof extractionResult.layoutNode!.children
  });

  // Step 2: Validate the extracted LayoutNode structure
  const validation = validateStrictLayoutNode(extractionResult.layoutNode!);

  if (!validation.valid) {
    console.log(`[VALIDATOR] LayoutNode validation FAILED: ${validation.errors?.join(", ")}`);
    return {
      valid: false,
      errors: validation.errors || ["LayoutNode validation failed"],
      rawParsed: extractionResult.layoutNode,
      errorMetadata: {
        schemaErrors: {
          layoutNodeErrors: validation.errors,
        },
      },
    };
  }

  // Step 2b: Options capability (components with acceptsOptions must have options; no options on others)
  const capabilityErrors = validateOptionsCapability(extractionResult.layoutNode!);
  if (capabilityErrors.length > 0) {
    console.log(`[VALIDATOR] Options capability validation FAILED: ${capabilityErrors.join("; ")}`);
    return {
      valid: false,
      errors: capabilityErrors,
      rawParsed: extractionResult.layoutNode,
      errorMetadata: {
        schemaErrors: {
          layoutNodeErrors: capabilityErrors,
        },
      },
    };
  }

  // Step 2c: Registry structure (acceptsChildren, requiredProps, forbiddenProps)
  const registryErrors = validateRegistryStructure(extractionResult.layoutNode!);
  if (registryErrors.length > 0) {
    console.log(`[VALIDATOR] Registry structure validation FAILED: ${registryErrors.join("; ")}`);
    return {
      valid: false,
      errors: registryErrors,
      rawParsed: extractionResult.layoutNode,
      errorMetadata: {
        schemaErrors: {
          layoutNodeErrors: registryErrors,
        },
      },
    };
  }

  console.log(`[VALIDATOR] LayoutNode validation PASSED`);

  // Step 3: Create AIResponse wrapper (required by system architecture)
  const aiResponse = {
    intent: expectedIntent || "create",
    ui: extractionResult.layoutNode!,
    explanation: "Generated UI layout"
  };

  // Step 4: Post-process to fix common issues (minimal processing)
  const postProcessed = postProcessAIResponse(aiResponse);

  console.log(`[VALIDATOR] STRICT validation COMPLETED SUCCESSFULLY`);
  return {
    valid: true,
    parsedResponse: postProcessed as AIResponseParsed,
  };
}

/**
 * Clean JSON for direct layout parsing
 */
function cleanDirectJSON(jsonStr: string): string {
  let cleaned = jsonStr.trim();
  
  // Remove markdown code fences
  cleaned = cleaned.replace(/^```json\s*/i, "");
  cleaned = cleaned.replace(/^```\s*/i, "");
  cleaned = cleaned.replace(/\s*```$/i, "");
  
  // Remove leading/trailing text before first { or after last }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  
  // Remove trailing commas before } or ]
  cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1");
  
  // Remove comments
  cleaned = cleaned.replace(/\/\/.*$/gm, "");
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, "");
  
  return cleaned.trim();
}

/**
 * Main validation function (legacy - for backward compatibility)
 * 
 * Validates model output after generation:
 * 1. Extracts JSON using robust extractor (handles malformed JSON)
 * 2. Post-processes to fix common issues
 * 3. Validates against schemas
 * 4. Returns validation result
 * 
 * @param rawResponse - Raw string response from LLM
 * @param expectedIntent - Optional expected intent ("create" or "modify")
 * @returns ValidationResult with valid flag and parsed response or errors
 */
export function validateModelOutput(
  rawResponse: string,
  expectedIntent?: "create" | "modify"
): ValidationResult {
  // Use the new direct layout validation
  return validateDirectLayoutOutput(rawResponse, expectedIntent);
}

/**
 * Normalize a LayoutNode tree so children is always undefined, string, or array of valid items.
 * Fixes model output where children is null or a non-array object (avoids "Children must be a string or array").
 */
export function normalizeLayoutNode(node: LayoutNode): LayoutNode {
  if (!node || typeof node !== 'object') return node;
  const normalized = { ...node } as LayoutNode;
  if (normalized.props && typeof normalized.props === 'object') {
    normalized.props = { ...normalized.props };
  }
  if (normalized.children !== undefined && normalized.children !== null) {
    if (typeof normalized.children === 'string') {
      // keep
    } else if (Array.isArray(normalized.children)) {
      normalized.children = normalized.children
        .filter((c) => c != null && (typeof c === 'string' || (typeof c === 'object' && c !== null)))
        .map((c) => (typeof c === 'object' && c !== null ? normalizeLayoutNode(c as LayoutNode) : c));
    } else {
      // Invalid: object or other; treat as no children
      (normalized as any).children = undefined;
    }
  }
  return normalized;
}

/**
 * Validates options capability: components with acceptsOptions must have options;
 * components without acceptsOptions must not have componentProps.options.
 * Returns list of errors (empty if valid).
 */
function validateOptionsCapability(node: any, path = "/"): string[] {
  const errors: string[] = [];
  if (!node || typeof node !== "object") return errors;

  if (node.type === "component") {
    const props = node.props || {};
    const componentName = props.component ?? props.componentName;
    const options = props.componentProps?.options;
    const hasOptions = Array.isArray(options) && options.length > 0;

    if (componentName) {
      if (componentAcceptsOptions(componentName)) {
        if (!hasOptions) {
          errors.push(
            `Component "${componentName}" at ${path} accepts options (per registry) but has no or empty componentProps.options. Embed all options in that component; do not use sibling box/container.`
          );
        }
      } else if (options !== undefined) {
        errors.push(
          `Component "${componentName}" at ${path} does not accept options (per registry) but has componentProps.options. Remove options from this component.`
        );
      }
    }
  }

  if (Array.isArray(node.children)) {
    node.children.forEach((child: any, i: number) => {
      if (child && typeof child === "object") {
        errors.push(...validateOptionsCapability(child, `${path}/children/${i}`));
      }
    });
  }

  return errors;
}

/**
 * Validates data capability: single-value components (Progress) must not receive multi-series data;
 * multi-series components (PieChart, etc.) must use componentProps.data for distribution/slices.
 * Returns list of errors (empty if valid).
 */
function validateDataCapability(node: any, path = "/"): string[] {
  const errors: string[] = [];
  if (!node || typeof node !== "object") return errors;

  if (node.type === "component") {
    const props = node.props || {};
    const componentName = props.component ?? props.componentName;
    const cp = props.componentProps;
    const data = cp?.data;
    const value = cp?.value;
    const hasDataArray = Array.isArray(data) && data.length > 0;
    const hasSingleValue = typeof value === "number";

    if (componentName) {
      const meta = getComponentMeta(componentName);
      const acceptsData = meta?.acceptsData;

      if (acceptsData === "single-value") {
        if (hasDataArray) {
          const { multiSeries } = getDataCapabilityComponents();
          const list = multiSeries.length ? multiSeries.slice(0, 8).join(", ") : "PieChart";
          errors.push(
            `Component "${componentName}" at ${path} only supports a single value (0-100). The user requested multiple segments/slices. Use a component that accepts multi-series data: ${list}.`
          );
        }
      } else if (acceptsData === "multi-series") {
        if (hasSingleValue && !hasDataArray) {
          const { singleValue } = getDataCapabilityComponents();
          const singleList = singleValue.length ? singleValue.join(", ") : "Progress";
          errors.push(
            `Component "${componentName}" at ${path} must use componentProps.data for distribution/slices (e.g. data: [{ name: "A", value: 40 }, { name: "B", value: 35 }]). For a single percentage use: ${singleList}.`
          );
        }
      }
    }
  }

  if (Array.isArray(node.children)) {
    node.children.forEach((child: any, i: number) => {
      if (child && typeof child === "object") {
        errors.push(...validateDataCapability(child, `${path}/children/${i}`));
      }
    });
  }

  return errors;
}

/**
 * True if any of the validation errors are data-capability errors (for retry with suggested components).
 */
export function isDataCapabilityValidationError(errors: string[]): boolean {
  if (!Array.isArray(errors) || errors.length === 0) return false;
  const patterns = [
    "only supports a single value",
    "must use componentProps.data for distribution",
    "accepts multi-series data",
  ];
  return errors.some((e) => patterns.some((p) => e.includes(p)));
}

/**
 * Validates registry structure: acceptsChildren, requiredProps, forbiddenProps.
 * Returns list of errors (empty if valid).
 */
function validateRegistryStructure(node: any, path = "/"): string[] {
  const errors: string[] = [];
  if (!node || typeof node !== "object") return errors;

  if (node.type === "component") {
    const props = node.props || {};
    const componentName = (props.component ?? props.componentName) as string | undefined;
    if (!componentName) {
      if (Array.isArray(node.children)) {
        node.children.forEach((child: any, i: number) => {
          if (child && typeof child === "object") {
            errors.push(...validateRegistryStructure(child, `${path}/children/${i}`));
          }
        });
      }
      return errors;
    }

    // Every component in the manifest must be renderable; reject unregistered names so pipeline fixes or user gets clear error
    const nameStr = String(componentName).trim();
    if (!nameStr || !isRegisteredComponent(nameStr)) {
      const available = getAvailableComponentNames().slice(0, 20).join(", ");
      errors.push(
        `Component "${componentName}" at ${path} is not in the component manifest. Use only registered components. Available (sample): ${available}…`
      );
    }

    // Label with tooltip prop is invalid; tooltips must use TooltipProvider > Tooltip > TooltipTrigger + TooltipContent
    if (componentName === "Label" && (props.tooltip != null || props.componentProps?.tooltip != null)) {
      errors.push(
        `Component "Label" at ${path} has a tooltip prop. Use TooltipProvider > Tooltip > TooltipTrigger (Button or other) + TooltipContent for tooltips; never use Label with a tooltip prop.`
      );
    }

    const meta = getComponentMeta(componentName);
    if (meta) {
      if (meta.acceptsChildren === false) {
        const children = node.children;
        const hasChildren =
          Array.isArray(children) && children.length > 0;
        if (hasChildren) {
          errors.push(
            `Component "${componentName}" at ${path} must not have children (registry: structure/leaf). Remove child nodes or use componentProps.options.`
          );
        }
      }
      const requiredProps = meta.requiredProps ?? [];
      for (const key of requiredProps) {
        const inProps = key in props && props[key] != null && props[key] !== "";
        const inComponentProps =
          props.componentProps &&
          typeof props.componentProps === "object" &&
          key in props.componentProps &&
          props.componentProps[key] != null &&
          props.componentProps[key] !== "";
        if (!inProps && !inComponentProps) {
          errors.push(
            `Component "${componentName}" at ${path} is missing required prop "${key}" (per registry).`
          );
        }
      }
      const forbiddenProps = meta.forbiddenProps ?? [];
      for (const key of forbiddenProps) {
        if (key in props && props[key] !== undefined) {
          errors.push(
            `Component "${componentName}" at ${path} has forbidden prop "${key}" (per registry). Remove it.`
          );
        }
      }
    }
  }

  if (Array.isArray(node.children)) {
    node.children.forEach((child: any, i: number) => {
      if (child && typeof child === "object") {
        errors.push(...validateRegistryStructure(child, `${path}/children/${i}`));
      }
    });
  }

  return errors;
}

/**
 * Validates a LayoutNode directly (for existing UI validation)
 */
export function validateLayoutNodeDirect(node: LayoutNode): ValidationResult {
  const normalized = normalizeLayoutNode(node);
  const validation = validateLayoutNodeRelaxed(normalized);

  if (!validation.valid) {
    return {
      valid: false,
      errors: validation.errors || ["Unknown validation error"],
    };
  }

  const capabilityErrors = validateOptionsCapability(normalized);
  if (capabilityErrors.length > 0) {
    return {
      valid: false,
      errors: capabilityErrors,
    };
  }

  const registryErrors = validateRegistryStructure(normalized);
  if (registryErrors.length > 0) {
    return {
      valid: false,
      errors: registryErrors,
    };
  }

  const dataCapabilityErrors = validateDataCapability(normalized);
  if (dataCapabilityErrors.length > 0) {
    return {
      valid: false,
      errors: dataCapabilityErrors,
    };
  }

  return {
    valid: true,
  };
}
