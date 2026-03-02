/**
 * STRICT JSON VALIDATOR AND FIXER (shared)
 * Uses the component manifest as single source of truth.
 */

import {
  REGISTERED_COMPONENT_NAMES,
  isRegisteredComponent,
  isInteractiveComponent,
} from "./componentNames";

/** Layout types supported by LayoutRenderer (flex, grid, box, container, stack, component). */
interface ValidLayoutNode {
  type: "flex" | "grid" | "component" | "box" | "container" | "stack";
  props: Record<string, any>;
  children?: ValidLayoutNode[] | string;
}

export interface ValidationResult {
  isValid: boolean;
  fixedJson?: ValidLayoutNode;
  errors: string[];
}

export function validateAndFixLayoutNode(json: any): ValidationResult {
  const errors: string[] = [];
  if (!json || typeof json !== 'object') {
    return { isValid: false, errors: ['JSON is not an object'] };
  }
  const fixed = fixLayoutNodeStructure(json, errors);
  if (!fixed) {
    return { isValid: false, errors: errors.length > 0 ? errors : ['Could not fix JSON structure'] };
  }
  const validation = validateLayoutNodeStructure(fixed, errors);
  return { isValid: validation, fixedJson: validation ? fixed : undefined, errors };
}

function normalizeLabelChildren(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || Array.isArray(value)) return '';
  const obj = value as Record<string, unknown>;
  const s = (obj.text ?? obj.label ?? obj.value ?? obj.content ?? obj.title ?? '') as string;
  return typeof s === 'string' ? s : '';
}

function fixLayoutNodeStructure(json: any, errors: string[]): ValidLayoutNode | null {
  if (!json || typeof json !== 'object') {
    errors.push('Invalid JSON object');
    return null;
  }
  let type = json.type;
  if (type === 'container') {
    type = 'flex';
    errors.push('Fixed: Changed "container" to "flex"');
  }
  let props = json.props || {};
  if (typeof props !== 'object' || Array.isArray(props)) {
    props = {};
    errors.push('Fixed: Invalid props field, set to empty object');
  }
  const layoutTypes = ["flex", "grid", "container", "box", "stack"];
  if (!layoutTypes.includes(String(type).toLowerCase())) {
    const typeStr = String(type).toLowerCase();
    const correctComponentName = REGISTERED_COMPONENT_NAMES.find(
      (name) => name.toLowerCase() === typeStr
    );
    if (correctComponentName) {
      errors.push(`Fixed: Converted incorrect type "${type}" to proper component structure with component "${correctComponentName}"`);
      return {
        type: "component",
        props: { component: correctComponentName, ...props },
        children: json.children ?? "",
      };
    }
  }
  if (props.children && Array.isArray(props.children)) {
    const childrenArray = props.children;
    delete props.children;
    json.children = childrenArray;
    errors.push('Fixed: Moved children array from props to correct location');
  }
  if (type === 'component') {
    const rawComponent = props.component ?? props.componentName;
    if (!rawComponent || typeof rawComponent !== 'string' || !rawComponent.trim()) {
      errors.push('Missing component field in component type');
      return null;
    }
    const trimmed = String(rawComponent).trim();
    const manifestMatch = REGISTERED_COMPONENT_NAMES.find((n) => n.toLowerCase() === trimmed.toLowerCase());
    const normalizedName = manifestMatch ?? (trimmed.charAt(0).toUpperCase() + trimmed.slice(1));
    props.component = normalizedName;
    if (props.componentName !== undefined) delete props.componentName;
    if (!isRegisteredComponent(props.component)) {
      if (props.component === 'Rating') {
        errors.push('Fixed: Converted unregistered "Rating" component to star rating buttons');
        return {
          type: 'flex',
          props: { direction: 'row', gap: 4 },
          children: [
            { type: 'component', props: { component: 'Button', minWidth: 44, minHeight: 44, 'aria-label': '1 star' }, children: '*' },
            { type: 'component', props: { component: 'Button', minWidth: 44, minHeight: 44, 'aria-label': '2 stars' }, children: '*' },
            { type: 'component', props: { component: 'Button', minWidth: 44, minHeight: 44, 'aria-label': '3 stars' }, children: '*' },
            { type: 'component', props: { component: 'Button', minWidth: 44, minHeight: 44, 'aria-label': '4 stars' }, children: '*' },
            { type: 'component', props: { component: 'Button', minWidth: 44, minHeight: 44, 'aria-label': '5 stars' }, children: '*' }
          ]
        };
      } else if (props.component === 'Image') {
        errors.push('Fixed: Converted unregistered "Image" component to Label');
        props.component = 'Label';
      } else {
        errors.push(`Fixed: Converted unregistered component "${props.component}" to Label`);
        props.component = 'Label';
      }
    }
    if (props.component === 'Avatar') {
      const raw = json.children;
      if (raw === undefined || raw === null || typeof raw === 'string' || !Array.isArray(raw)) {
        const fallbackText = typeof raw === 'string' && raw.trim() ? raw.trim() : '?';
        json.children = [
          { type: 'component', props: { component: 'AvatarFallback' }, children: fallbackText },
        ];
        errors.push('Fixed: Avatar children must be array (AvatarFallback); converted to correct structure');
      }
    }
    if (props.component === 'Label') {
      if (json.children != null && typeof json.children === 'object' && !Array.isArray(json.children)) {
        json.children = normalizeLabelChildren(json.children);
        errors.push('Fixed: Label children was object; normalized to string');
      }
      if (!json.children || json.children === '') {
        if (props['aria-label']) {
          json.children = props['aria-label'];
          delete props['aria-label'];
          errors.push('Fixed: Moved aria-label to Label children content');
        } else {
          json.children = 'Label Text';
          errors.push('Fixed: Added default content to empty Label');
        }
      }
    }
    if (props.component === 'Input' && json.children && typeof json.children === 'string') {
      const childrenText = json.children.trim();
      if (childrenText.match(/^\$\d+(\.\d{2})?$/) || childrenText.toLowerCase().includes('price') || props['aria-label']?.toLowerCase().includes('price')) {
        props.component = 'Label';
        delete props.minWidth;
        delete props.minHeight;
        delete props['aria-label'];
        errors.push('Fixed: Converted Input component with price content to Label');
      }
    }
    if (isInteractiveComponent(props.component)) {
      if (!props.minWidth) { props.minWidth = 44; errors.push('Fixed: Added minWidth: 44 to interactive component'); }
      if (!props.minHeight) { props.minHeight = 44; errors.push('Fixed: Added minHeight: 44 to interactive component'); }
      if (!props['aria-label']) { props['aria-label'] = `${props.component} field`; errors.push('Fixed: Added aria-label to interactive component'); }
    }
  }
  if (type === 'flex') {
    if (!props.direction) { props.direction = 'column'; errors.push('Fixed: Added direction: column to flex container'); }
    if (!props.gap) { props.gap = 8; errors.push('Fixed: Added gap: 8 to flex container'); }
  }
  let children = json.children;
  if (children === undefined) {
    if (type === 'flex') { children = []; errors.push('Fixed: Added missing children field'); }
  }
  if (typeof children === 'string' && (children.trim() === ',' || children.trim() === '",')) {
    children = '';
    errors.push('Fixed: Removed extra comma from children field');
  }
  if (props['aria-label'] && (props['aria-label'].trim() === ',' || props['aria-label'].trim() === '",')) {
    delete props['aria-label'];
    errors.push('Fixed: Removed invalid aria-label with comma');
  }
  if (props.children) {
    if (!json.children) json.children = props.children;
    delete props.children;
    errors.push('Fixed: Removed children property from props');
  }
  if (Array.isArray(children)) {
    const fixedChildren: ValidLayoutNode[] = [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (typeof child === 'string') {
        if (child.trim() && child.trim() !== ',' && child.trim() !== '",') {
          fixedChildren.push({ type: 'box', props: {}, children: child.trim() });
        }
      } else {
        const fixedChild = fixLayoutNodeStructure(child, errors);
        if (fixedChild) fixedChildren.push(fixedChild);
      }
    }
    children = fixedChildren;
  } else if (children !== undefined && typeof children !== 'string') {
    children = '';
    errors.push('Fixed: Invalid children field, set to empty string');
  }
  const result: ValidLayoutNode = {
    type: type as ValidLayoutNode["type"],
    props,
  };
  if (children !== undefined) result.children = children;
  return result;
}

function validateLayoutNodeStructure(node: ValidLayoutNode, errors: string[]): boolean {
  const validTypes: ValidLayoutNode["type"][] = ["flex", "grid", "component", "box", "container", "stack"];
  if (!node.type || !validTypes.includes(node.type as ValidLayoutNode["type"])) {
    errors.push(`Invalid type: ${node.type}. Valid: ${validTypes.join(", ")}`);
    return false;
  }
  if (!node.props || typeof node.props !== 'object' || Array.isArray(node.props)) {
    errors.push('Invalid props field');
    return false;
  }
  if (node.type === 'component' && !node.props.component) {
    errors.push('Component type missing component field');
    return false;
  }
  if (node.children === undefined) {
    if (node.type === 'flex') { errors.push('Missing children field'); return false; }
    return true;
  }
  if (Array.isArray(node.children)) {
    for (let i = 0; i < node.children.length; i++) {
      if (!validateLayoutNodeStructure(node.children[i], errors)) return false;
    }
  } else if (typeof node.children !== 'string') {
    errors.push('Children must be string or array');
    return false;
  }
  return true;
}

export function cleanAndTruncateJSON(rawJson: string): string {
  const firstBrace = rawJson.indexOf('{');
  if (firstBrace === -1) return rawJson;
  let braceCount = 0;
  let endIndex = -1;
  for (let i = firstBrace; i < rawJson.length; i++) {
    const char = rawJson[i];
    if (char === '{') braceCount++;
    else if (char === '}') {
      braceCount--;
      if (braceCount === 0) { endIndex = i; break; }
    }
  }
  if (endIndex !== -1) return rawJson.substring(firstBrace, endIndex + 1);
  return rawJson.substring(firstBrace);
}
