/**
 * Children-to-Data derivation for components that accept either:
 * - A data prop (e.g. options, items) from componentProps, or
 * - Structural children (e.g. Label, RadioGroupItem, TabsTrigger) that map to that data.
 *
 * Ensures the layout schema works whether the prompt produces "options: [...]" or
 * "children: [Label A, Label B, ...]" so all components render as asked.
 */

import type { LayoutNode } from "./schema";
import { CHART_COMPONENT_NAMES } from "./component-render-defaults";

/** Result of deriving component data from children */
export interface DerivedDataResult {
  /** Updated component props (with options/items etc. filled from children when applicable) */
  componentProps: Record<string, unknown>;
  /** When true, the renderer should not pass children to the component (data is in props) */
  suppressChildren: boolean;
}

/**
 * Extract a single label/text value from a layout node.
 * Handles: node.children (string), props.children, props.label, props.value, aria-label,
 * and one level of recursion (e.g. Label wrapper around text, or first child that has text).
 */
export function getLabelTextFromNode(node: LayoutNode): string {
  if (!node || typeof node !== "object") return "";
  const n = node as any;
  const props = n.props || {};

  // Direct string children
  if (typeof n.children === "string" && String(n.children).trim() !== "")
    return String(n.children).trim();

  // Props often carry the label in schema (e.g. props.children, props.label, aria-label)
  if (props.children != null && typeof props.children === "string" && String(props.children).trim() !== "")
    return String(props.children).trim();
  if (props.label != null && String(props.label).trim() !== "") return String(props.label).trim();
  if (props.value != null && String(props.value).trim() !== "") return String(props.value).trim();
  if (props["aria-label"] != null && String(props["aria-label"]).trim() !== "")
    return String(props["aria-label"]).trim();

  // Label component: text can be in children or props
  const comp = props.component ?? props.componentName;
  if (comp === "Label") {
    if (typeof n.children === "string") return String(n.children).trim();
    return (props.children != null && typeof props.children === "string" ? String(props.children).trim() : "") || "";
  }

  // TabsTrigger, RadioGroupItem, BreadcrumbLink, etc.: often have children as label
  const triggerLike = ["TabsTrigger", "RadioGroupItem", "BreadcrumbLink", "BreadcrumbPage", "AccordionTrigger"];
  if (triggerLike.includes(comp)) {
    if (typeof n.children === "string") return String(n.children).trim();
    if (props.children != null && typeof props.children === "string") return String(props.children).trim();
  }

  // Box/container with string children (e.g. type "box", children: "Option C")
  if ((n.type === "box" || n.type === "container") && typeof n.children === "string" && String(n.children).trim() !== "")
    return String(n.children).trim();

  // Recurse into first child once (e.g. Label wrapping text, or nested structure)
  if (Array.isArray(n.children) && n.children.length > 0) {
    const first = n.children[0];
    if (typeof first === "string" && String(first).trim() !== "") return String(first).trim();
    if (first && typeof first === "object") {
      const inner = getLabelTextFromNode(first as LayoutNode);
      if (inner !== "") return inner;
    }
  }

  return "";
}

/** Get display text from a child that may be a LayoutNode or a raw string (schema sometimes has string children). */
function getTextFromChild(child: LayoutNode | string): string {
  if (typeof child === "string" && String(child).trim() !== "") return String(child).trim();
  if (child && typeof child === "object") return getLabelTextFromNode(child as LayoutNode);
  return "";
}

/**
 * Derive options array from children (nodes and/or raw strings).
 * Handles mixed arrays e.g. ["Apple", { type: "box", children: "Option C" }, ...] so no option is dropped.
 */
function deriveOptionsFromChildren(children: (LayoutNode | string)[]): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (const child of children) {
    const text = getTextFromChild(child);
    if (text !== "") options.push({ value: text, label: text });
  }
  return options;
}

/**
 * Derive items array from children (e.g. for SideNavigation, Breadcrumb: [{ label: string }, ...]).
 */
function deriveItemsFromChildren(children: (LayoutNode | string)[]): { label: string; id?: string }[] {
  const items: { label: string; id?: string }[] = [];
  for (let i = 0; i < children.length; i++) {
    const text = getTextFromChild(children[i]);
    if (text !== "") items.push({ id: `item-${i}`, label: text });
  }
  return items;
}

/** Components that accept options (value/label) derived from Label/RadioGroupItem-like children */
const OPTIONS_FROM_CHILDREN = ["Select", "RadioGroup"] as const;

/** Components that accept items (label) derived from Label/link-like children */
const ITEMS_FROM_CHILDREN = ["SideNavigation", "Breadcrumb"] as const;

/** Parse a number from a string like "40%", "35", "25.5" */
function parseChartValue(v: unknown): number | null {
  if (typeof v === "number" && !isNaN(v)) return v;
  if (typeof v === "string") {
    const trimmed = v.trim().replace(/%\s*$/, "");
    const n = parseFloat(trimmed);
    return isNaN(n) ? null : n;
  }
  return null;
}

/**
 * Derive chart data array from children (e.g. Label with caption "A" and children "40%" -> { name: "A", value: 40 }).
 * Handles: Label with componentProps.caption + children as percentage, or label/value props.
 */
function deriveChartDataFromChildren(children: (LayoutNode | string)[]): { name: string; value: number }[] {
  const data: { name: string; value: number }[] = [];
  for (const child of children) {
    if (typeof child === "string") {
      const val = parseChartValue(child);
      if (val !== null) data.push({ name: String(child).trim(), value: val });
      continue;
    }
    if (!child || typeof child !== "object") continue;
    const n = child as any;
    const props = n.props || {};
    const compProps = props.componentProps || {};
    const name =
      (compProps as any).caption != null
        ? String((compProps as any).caption).trim()
        : props.label != null
          ? String(props.label).trim()
          : "";
    const valueFromChildren = parseChartValue(n.children);
    const valueFromProps = parseChartValue(props.value);
    const value = valueFromChildren ?? valueFromProps;
    if (name !== "" && value != null) {
      data.push({ name, value });
    } else if (value != null) {
      data.push({ name: name || String(n.children || "Item").trim(), value });
    } else if (name !== "") {
      const text = getLabelTextFromNode(child as LayoutNode);
      const v = parseChartValue(text);
      if (v != null) data.push({ name, value: v });
    }
  }
  return data;
}

/** Tabs, Accordion, etc. use structural children (TabsList, TabsTrigger, TabsContent, AccordionItem, ...) and are not listed here — they receive real React children from the renderer. */

/**
 * Derive componentProps from children when the component supports "children as data".
 * Returns updated componentProps and whether to suppress passing children to the component.
 */
export function deriveDataFromChildren(
  componentName: string,
  children: LayoutNode[] | string | undefined,
  componentProps: Record<string, unknown>
): DerivedDataResult {
  const out = { ...componentProps };
  let suppressChildren = false;
  const childArray = Array.isArray(children) ? children : [];
  const name = String(componentName ?? "");

  // Options-based (Select, RadioGroup): derive options from Label/RadioGroupItem children
  if ((OPTIONS_FROM_CHILDREN as unknown as string[]).indexOf(name) !== -1) {
    const existing = out.options as { value?: string; label?: string }[] | undefined;
    const hasOptions = Array.isArray(existing) && existing.length > 0;
    if (!hasOptions && childArray.length > 0) {
      const options = deriveOptionsFromChildren(childArray);
      if (options.length > 0) {
        out.options = options;
        suppressChildren = true;
      }
    }
  }

  // Items-based (SideNavigation, Breadcrumb): derive items from children
  if ((ITEMS_FROM_CHILDREN as unknown as string[]).indexOf(name) !== -1) {
    const existing = out.items as { label?: string }[] | undefined;
    const hasItems = Array.isArray(existing) && existing.length > 0;
    if (!hasItems && childArray.length > 0) {
      const items = deriveItemsFromChildren(childArray);
      if (items.length > 0) {
        out.items = items;
        suppressChildren = true;
      }
    }
  }

  // Chart data (PieChart, BarChart, etc.): derive data from Label-style children (caption + percentage/value)
  if ((CHART_COMPONENT_NAMES as unknown as string[]).indexOf(name) !== -1) {
    const existing = out.data as { name?: string; value?: number }[] | undefined;
    const hasData = Array.isArray(existing) && existing.length > 0;
    if (!hasData && childArray.length > 0) {
      const chartData = deriveChartDataFromChildren(childArray);
      if (chartData.length > 0) {
        out.data = chartData;
        suppressChildren = true;
      }
    }
  }

  return { componentProps: out, suppressChildren };
}
