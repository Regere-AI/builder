/**
 * STRICT JSON EXTRACTOR - HIGHEST PRIORITY
 * 
 * This module has ONE JOB: Extract ONLY type, props, children from AI responses.
 * NO fallbacks, NO repetition, NO extra fields.
 * 
 * Strategy:
 * 1. Find the FIRST valid LayoutNode structure
 * 2. Extract ONLY type, props, children
 * 3. Validate and fix the structure
 * 4. Return it ONCE
 */

import { validateAndFixLayoutNode, cleanAndTruncateJSON } from "./json-validator-strict";

interface StrictLayoutNode {
  type: string;
  props: Record<string, any>;
  children?: StrictLayoutNode[] | string; // optional for component/box when model omits it
}

export interface StrictExtractionResult {
  success: boolean;
  layoutNode?: StrictLayoutNode;
  error?: string;
  debugInfo?: {
    originalLength: number;
    cleanedLength: number;
    extractionMethod: string;
    foundStructures: number;
  };
}

/**
 * MAIN EXTRACTION FUNCTION - HIGHEST PRIORITY
 * Extract ONLY the first valid LayoutNode structure
 * NO FALLBACKS - FAIL FAST IF NO VALID JSON FOUND
 */
export function extractStrictLayoutNode(rawContent: string): StrictExtractionResult {
  const debugInfo = {
    originalLength: rawContent.length,
    cleanedLength: 0,
    extractionMethod: '',
    foundStructures: 0
  };

  console.log(`[STRICT EXTRACTOR] Starting extraction, content length: ${rawContent.length}`);
  console.log(`[STRICT EXTRACTOR] Raw content preview: ${rawContent.substring(0, 500)}...`);
  
  // Step 1: Clean and truncate to prevent incomplete JSON
  const truncated = cleanAndTruncateJSON(rawContent);
  console.log(`[STRICT EXTRACTOR] Truncated length: ${truncated.length}`);
  
  // Step 2: Clean the content
  const cleaned = aggressiveCleanJSON(truncated);
  debugInfo.cleanedLength = cleaned.length;
  
  console.log(`[STRICT EXTRACTOR] Cleaned content length: ${cleaned.length}`);
  console.log(`[STRICT EXTRACTOR] Cleaned preview: ${cleaned.substring(0, 300)}...`);

  // Step 3: Try direct JSON parse first (best: full root with optional extra keys stripped)
  const directResult = tryDirectParse(cleaned);
  if (directResult.success) {
    debugInfo.extractionMethod = 'direct_parse';
    console.log(`[STRICT EXTRACTOR] SUCCESS via direct parse`);
    return { ...directResult, debugInfo };
  }

  // Step 4: Try bracket-based extraction (outermost { ... } so we get root, not inner fragment)
  const bracketResult = tryBracketExtraction(cleaned);
  if (bracketResult.success) {
    debugInfo.extractionMethod = 'bracket_extraction';
    console.log(`[STRICT EXTRACTOR] SUCCESS via bracket extraction`);
    return { ...bracketResult, debugInfo };
  }

  // Step 5: Fallback: regex extraction for LayoutNode patterns (may return inner fragment)
  const regexResult = tryRegexExtraction(cleaned);
  if (regexResult.success) {
    debugInfo.extractionMethod = 'regex_extraction';
    debugInfo.foundStructures = regexResult.foundStructures || 0;
    console.log(`[STRICT EXTRACTOR] SUCCESS via regex extraction, found ${debugInfo.foundStructures} structures`);
    return { ...regexResult, debugInfo };
  }

  // CRITICAL: NO FALLBACKS - FAIL COMPLETELY
  console.error(`[STRICT EXTRACTOR] COMPLETE FAILURE - No valid LayoutNode structure found`);
  console.error(`[STRICT EXTRACTOR] Raw content: ${rawContent}`);
  console.error(`[STRICT EXTRACTOR] Cleaned content: ${cleaned}`);
  
  return {
    success: false,
    error: `CRITICAL FAILURE: No valid LayoutNode structure found in response. Raw length: ${rawContent.length}, Cleaned length: ${cleaned.length}`,
    debugInfo
  };
}

/**
 * Remove LLM template-literal garbage that breaks JSON parse (e.g. "${":"", "{${":"}"})
 */
function removeTemplateLiteralGarbage(content: string): string {
  return content
    .replace(/"\$\{"\s*:\s*""\s*,\s*"\{\$\{"\s*:\s*""\}"\s*}/g, " ")
    .replace(/,?\s*"\$\{[^"]*"\s*:\s*[^,]*(?:,\s*"[^"]*"\s*:\s*[^"]*")*\s*}/g, " ")
    .replace(/\$\{[^}]*}/g, " ");
}

/**
 * Aggressive JSON cleaning - remove everything except the core JSON
 */
function aggressiveCleanJSON(content: string): string {
  let cleaned = content.trim();

  // Remove template-literal / interpolation garbage that breaks parsing
  cleaned = removeTemplateLiteralGarbage(cleaned);

  // Remove markdown code blocks
  cleaned = cleaned.replace(/^```json\s*/i, "");
  cleaned = cleaned.replace(/^```\s*/i, "");
  cleaned = cleaned.replace(/\s*```$/i, "");

  // Remove any text before the first {
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace > 0) {
    cleaned = cleaned.substring(firstBrace);
  }
  
  // CRITICAL FIX: Handle incomplete JSON by finding the last complete structure
  let braceCount = 0;
  let lastValidEnd = -1;
  
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === '{') {
      braceCount++;
    } else if (char === '}') {
      braceCount--;
      if (braceCount === 0) {
        lastValidEnd = i;
      }
    }
  }
  
  // If we found a complete JSON structure, use it
  if (lastValidEnd !== -1) {
    cleaned = cleaned.substring(0, lastValidEnd + 1);
  }
  
  // Fix common JSON issues
  cleaned = cleaned
    .replace(/,(\s*[}\]])/g, '$1')  // Remove trailing commas
    .replace(/([{,]\s*)(\w+):/g, '$1"$2":')  // Quote unquoted keys
    .replace(/:\s*([^",\[\]{}]+)([,}])/g, (match, value, ending) => {
      const trimmedValue = value.trim();
      // Don't quote numbers, booleans, or null
      if (trimmedValue === 'true' || trimmedValue === 'false' || 
          trimmedValue === 'null' || /^\d+(\.\d+)?$/.test(trimmedValue)) {
        return `: ${trimmedValue}${ending}`;
      }
      return `: "${trimmedValue}"${ending}`;
    })
    .replace(/}\s*{/g, '},{')  // Fix missing commas between objects
    .replace(/]\s*\[/g, '],[')  // Fix missing commas between arrays
    .replace(/"\s*"/g, '","')  // Fix missing commas between strings
    .replace(/\n/g, ' ')  // Remove newlines
    .replace(/\s+/g, ' ');  // Normalize whitespace
  
  return cleaned.trim();
}

/**
 * Try to parse the cleaned content directly as JSON
 */
function tryDirectParse(cleaned: string): StrictExtractionResult {
  try {
    // First, try to fix structural issues in the JSON
    const fixedJson = fixStructuralIssues(cleaned);
    const parsed = JSON.parse(fixedJson);
    const layoutNode = extractLayoutNodeFromParsed(parsed);
    
    if (layoutNode) {
      // Validate and fix the extracted layout node
      const validation = validateAndFixLayoutNode(layoutNode);
      
      if (validation.isValid && validation.fixedJson) {
        if (validation.errors.length > 0) {
          console.log(`[STRICT EXTRACTOR] Applied fixes: ${validation.errors.join(', ')}`);
        }
        
        return {
          success: true,
          layoutNode: validation.fixedJson
        };
      } else {
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join(', ')}`
        };
      }
    }
    
    return {
      success: false,
      error: "Parsed JSON but no valid LayoutNode structure found"
    };
  } catch (error) {
    return {
      success: false,
      error: `Direct JSON parse failed: ${error}`
    };
  }
}

/**
 * Fix structural issues in the JSON that the AI commonly generates
 */
function fixStructuralIssues(jsonStr: string): string {
  let fixed = jsonStr;
  
  // Fix the main structural issue: components with children arrays in props
  // Pattern: "component": "Card", "children": [array], "minWidth": 44
  // Should be: "component": "Card", "minWidth": 44}, "children": [array]
  
  // This regex finds components with children arrays in the wrong place
  fixed = fixed.replace(
    /"component":\s*"([^"]+)",\s*"children":\s*(\[[^\]]*\]),\s*("minWidth"[^}]*)/g,
    '"component": "$1", $3}, "children": $2'
  );
  
  // Fix trailing commas in children fields that are just commas
  fixed = fixed.replace(/"children":\s*","/g, '"children": ""');
  fixed = fixed.replace(/"children":\s*",/g, '"children": "",');
  
  // Fix incomplete structures at the end
  // If the JSON ends abruptly, try to close it properly
  let braceCount = 0;
  let bracketCount = 0;
  
  for (let i = 0; i < fixed.length; i++) {
    const char = fixed[i];
    if (char === '{') braceCount++;
    else if (char === '}') braceCount--;
    else if (char === '[') bracketCount++;
    else if (char === ']') bracketCount--;
  }
  
  // Close any unclosed brackets and braces
  while (bracketCount > 0) {
    fixed += ']';
    bracketCount--;
  }
  while (braceCount > 0) {
    fixed += '}';
    braceCount--;
  }
  
  return fixed;
}

/**
 * Try regex-based extraction to find LayoutNode patterns
 */
function tryRegexExtraction(content: string): StrictExtractionResult & { foundStructures?: number } {
  // Look for objects that have type, props, and children fields
  const layoutNodePattern = /\{\s*"type"\s*:\s*"[^"]+"\s*,\s*"props"\s*:\s*\{[^}]*\}\s*,\s*"children"\s*:\s*(?:"[^"]*"|\[[^\]]*\])\s*\}/g;
  
  const matches = content.match(layoutNodePattern);
  
  if (!matches || matches.length === 0) {
    return {
      success: false,
      error: "No LayoutNode patterns found via regex",
      foundStructures: 0
    };
  }

  console.log(`[STRICT EXTRACTOR] Found ${matches.length} potential LayoutNode patterns`);
  
  // Try to parse the first match
  for (let i = 0; i < matches.length; i++) {
    try {
      const parsed = JSON.parse(matches[i]);
      const layoutNode = extractLayoutNodeFromParsed(parsed);
      
      if (layoutNode) {
        return {
          success: true,
          layoutNode: layoutNode,
          foundStructures: matches.length
        };
      }
    } catch (error) {
      console.log(`[STRICT EXTRACTOR] Failed to parse match ${i}: ${error}`);
      continue;
    }
  }

  return {
    success: false,
    error: "Found LayoutNode patterns but none were valid JSON",
    foundStructures: matches.length
  };
}

/**
 * Try bracket-based extraction - find the outermost valid JSON object
 */
function tryBracketExtraction(content: string): StrictExtractionResult {
  let braceCount = 0;
  let startIndex = -1;
  let endIndex = -1;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    
    if (char === '{') {
      if (braceCount === 0) {
        startIndex = i;
      }
      braceCount++;
    } else if (char === '}') {
      braceCount--;
      if (braceCount === 0 && startIndex !== -1) {
        endIndex = i;
        break;
      }
    }
  }
  
  if (startIndex === -1 || endIndex === -1) {
    return {
      success: false,
      error: "No complete JSON object found via bracket extraction"
    };
  }
  
  const jsonStr = content.substring(startIndex, endIndex + 1);
  
  try {
    const parsed = JSON.parse(jsonStr);
    const layoutNode = extractLayoutNodeFromParsed(parsed);
    
    if (layoutNode) {
      return {
        success: true,
        layoutNode: layoutNode
      };
    }
    
    return {
      success: false,
      error: "Extracted JSON but no valid LayoutNode structure found"
    };
  } catch (error) {
    return {
      success: false,
      error: `Bracket extraction JSON parse failed: ${error}`
    };
  }
}

/**
 * Extract ONLY type, props, children from parsed JSON
 * This is the CRITICAL function that ensures we get EXACTLY what we need
 */
function extractLayoutNodeFromParsed(parsed: any): StrictLayoutNode | null {
  // Handle case where parsed is wrapped in other fields
  let candidate = parsed;
  
  // If parsed has a 'ui' field, use that
  if (parsed.ui && typeof parsed.ui === 'object') {
    candidate = parsed.ui;
  }
  
  // If parsed has a 'data' field with 'ui', use that
  if (parsed.data && parsed.data.ui && typeof parsed.data.ui === 'object') {
    candidate = parsed.data.ui;
  }
  
  // Now validate the candidate has the required fields
  if (!candidate || typeof candidate !== 'object') {
    console.log(`[STRICT EXTRACTOR] Candidate is not an object:`, typeof candidate);
    return null;
  }

  if (!candidate.type || typeof candidate.type !== 'string') {
    console.log(`[STRICT EXTRACTOR] Missing or invalid type field:`, candidate.type);
    return null;
  }

  if (candidate.props === undefined) {
    console.log(`[STRICT EXTRACTOR] Missing props field`);
    return null;
  }

  if (candidate.children === undefined) {
    console.log(`[STRICT EXTRACTOR] Missing children field`);
    return null;
  }

  // Extract ONLY type, props, children - strip any extra keys (e.g. "buttons", "cards", "alerts")
  const strictLayoutNode: StrictLayoutNode = {
    type: candidate.type,
    props: typeof candidate.props === 'object' && candidate.props !== null ? { ...candidate.props } : {},
    children: candidate.children
  };
  
  // Recursively clean children if they're an array
  if (Array.isArray(strictLayoutNode.children)) {
    strictLayoutNode.children = strictLayoutNode.children.map(child => {
      if (typeof child === 'string') {
        return child;
      } else if (child && typeof child === 'object') {
        // For child objects, just ensure they have the basic structure
        // Don't recursively validate them as top-level LayoutNodes
        if (child.type && child.props !== undefined && child.children !== undefined) {
          // Label must have string children; LLM sometimes outputs object -> "[object Object]"
          let normalizedChildren = child.children;
          const comp = (child.props && (child.props as any).component) ?? (child.props && (child.props as any).componentName);
          if (comp === 'Label' && normalizedChildren != null && typeof normalizedChildren === 'object' && !Array.isArray(normalizedChildren)) {
            const obj = normalizedChildren as Record<string, unknown>;
            const s = (obj.text ?? obj.label ?? obj.value ?? obj.content ?? obj.title ?? '') as string;
            normalizedChildren = typeof s === 'string' ? s : '';
          }
          return {
            type: child.type,
            props: child.props || {},
            children: normalizedChildren
          };
        } else {
          // Try to extract as a LayoutNode if it has the right structure
          const cleanChild = extractLayoutNodeFromParsed(child);
          return cleanChild || child;
        }
      } else {
        return child;
      }
    });
  }
  
  console.log(`[STRICT EXTRACTOR] Successfully extracted LayoutNode:`, {
    type: strictLayoutNode.type,
    hasProps: !!strictLayoutNode.props,
    childrenType: Array.isArray(strictLayoutNode.children) ? 'array' : typeof strictLayoutNode.children
  });
  
  return strictLayoutNode;
}

/**
 * Validate that a LayoutNode has the correct structure
 */
export function validateStrictLayoutNode(node: StrictLayoutNode): { valid: boolean; errors?: string[] } {
  const errors: string[] = [];
  
  if (!node.type || typeof node.type !== 'string') {
    errors.push('Invalid or missing type field');
  }
  
  if (node.props === undefined || (node.props !== null && typeof node.props !== 'object')) {
    errors.push('Invalid props field - must be object or null');
  }
  
  if (node.children !== undefined && typeof node.children !== 'string' && !Array.isArray(node.children)) {
    errors.push('Invalid children field - must be string or array');
  }
  // undefined children allowed for component/box (schema allows optional)
  
  // Recursively validate children if array
  if (Array.isArray(node.children)) {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (typeof child !== 'string') {
        const childValidation = validateStrictLayoutNode(child as StrictLayoutNode);
        if (!childValidation.valid) {
          errors.push(`Child ${i}: ${childValidation.errors?.join(', ')}`);
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}
