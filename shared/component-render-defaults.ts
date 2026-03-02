/**
 * Component render defaults and prompt-related config derived from component-manifest.json.
 * Used by LayoutRenderer (min dimensions), patch prompt (modifiable props), and create prompt (required props).
 */

import { COMPONENT_MANIFEST, getAvailableComponentNames } from "./componentNames";

type ManifestEntry = {
  props?: string[];
  variants?: string[];
  sizes?: string[];
  interactive?: boolean;
};

/** Components that need minimum width/height (or width in componentProps) to render visibly. Covers all manifest components that would otherwise appear empty. */
export const COMPONENTS_NEEDING_MIN_DIMENSIONS: readonly string[] = [
  // Charts (Recharts needs width/height)
  "AreaChart",
  "BarChart",
  "ComposedChart",
  "LineChart",
  "PieChart",
  "RadarChart",
  // Data / tables
  "DataTable",
  "Table",
  "TableHeader",
  "TableBody",
  "TableFooter",
  "TableHead",
  "TableRow",
  "TableCell",
  "TableCaption",
  // Overlays (need visible area)
  "Modal",
  "Dialog",
  "DialogContent",
  "DialogOverlay",
  "Popover",
  "PopoverContent",
  // Navigation / layout
  "Tabs",
  "TabsList",
  "TabsContent",
  "SideNavigation",
  "Accordion",
  "AccordionContent",
  // Feedback
  "Progress",
  "Slider",
  "Skeleton",
  "Alert",
  "AlertTitle",
  "AlertDescription",
  // Tooltip (needs area to show)
  "Tooltip",
  "TooltipContent",
];

/** Standard message when user requests to modify a property that is not in the manifest's modifiable props. */
export const STANDARD_NON_MODIFIABLE_MESSAGE =
  "The property \"{property}\" cannot be modified through prompt. Modifiable properties for {component} are: {list}.";

/**
 * Returns the list of modifiable prop names (and variant/size info) for a component.
 * Empty array means no modifiable properties.
 */
export function getModifiablePropsForComponent(componentName: string): string[] {
  const entry = (COMPONENT_MANIFEST as Record<string, ManifestEntry>)[componentName];
  if (!entry) return [];
  const props = entry.props ?? [];
  const variants = entry.variants ?? [];
  const sizes = entry.sizes ?? [];
  const parts: string[] = [...props];
  if (variants.length > 0) parts.push(`variant (${variants.join("|")})`);
  if (sizes.length > 0) parts.push(`size (${sizes.join("|")})`);
  return parts;
}

/**
 * Format the standard message when a property cannot be modified through prompt.
 */
export function formatNonModifiableMessage(
  property: string,
  component: string,
  modifiableList: string[]
): string {
  const list =
    modifiableList.length === 0
      ? "none"
      : modifiableList.join(", ");
  return STANDARD_NON_MODIFIABLE_MESSAGE.replace("{property}", property)
    .replace("{component}", component)
    .replace("{list}", list);
}

/**
 * Build full modifiable-props guidance string for ALL components in the manifest (for prompts).
 * Components with no modifiable props are listed as "(no modifiable properties)".
 */
export function buildFullModifiablePropsGuidance(): string {
  const lines: string[] = [];
  const names = getAvailableComponentNames();
  for (const name of names) {
    const list = getModifiablePropsForComponent(name);
    const text =
      list.length === 0
        ? "(no modifiable properties)"
        : list.join(", ");
    lines.push(`- ${name}: ${text}`);
  }
  return lines.join("\n");
}

/**
 * Default width/height for chart and data-viz components when not provided in JSON.
 */
export const DEFAULT_CHART_WIDTH = 320;
export const DEFAULT_CHART_HEIGHT = 280;

/** Chart component names (need width, height, data in componentProps when generating). */
export const CHART_COMPONENT_NAMES = [
  "AreaChart",
  "BarChart",
  "ComposedChart",
  "LineChart",
  "PieChart",
  "RadarChart",
] as const;

/** Default data for any chart when componentProps.data is missing or empty (so charts never .map() on undefined). */
export const DEFAULT_CHART_DATA = [
  { name: "A", value: 10 },
  { name: "B", value: 20 },
  { name: "C", value: 15 },
];

/**
 * Build guidance for create-prompt: required props so each component type renders correctly.
 * Used so generated JSON includes width/height/data etc. for all manifest components.
 */
export function buildRequiredPropsForGeneration(): string {
  const lines: string[] = [
    "Charts (AreaChart, BarChart, LineChart, PieChart, ComposedChart, RadarChart): include in componentProps: width (e.g. 300), height (e.g. 250), and data array. BarChart also requires bars array (e.g. [{ dataKey: 'value', name: 'Value' }] or [{ dataKey: 'sales', name: 'Sales' }]).",
    "DataTable: include componentProps with at least columns (array of { id, header }) and data (array) or emptyMessage string.",
    "Progress: include componentProps with value (0-100).",
    "SideNavigation: include componentProps with width (e.g. 240) if sidebar width is needed.",
    "Modal, Dialog, Popover: ensure parent container or props give visible area.",
    "Input, Button, Checkbox, Select, Switch, Slider, Textarea (interactive): include minWidth: 44, minHeight: 44, aria-label in props.",
  ];
  return lines.join(" ");
}
