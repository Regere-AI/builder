/**
 * Component → Prompt mapping: single source of truth for how to generate JSON
 * so that every component in component-manifest.json is used correctly when the user asks for it.
 *
 * Used by create prompt and system prompt to ensure:
 * - All manifest components are registered and appear in AVAILABLE COMPONENTS / COMPONENTS IN REGISTRY.
 * - Prompts generate the required JSON (correct component + structure, never substitutes like Label for Button).
 */

import { getAvailableComponentNames, getDataCapabilityComponents } from "./componentNames";

/** Same as getAvailableComponentNames(): all manifest components, sorted. Use for prompts (AVAILABLE COMPONENTS / registry list). */
export const COMPONENT_NAMES_FOR_PROMPT = getAvailableComponentNames();

/**
 * Registry-driven data capability guidance for prompts.
 * Components that accept multi-series vs single-value are from the manifest, not hardcoded.
 */
export function getDataCapabilityPromptGuidance(): string {
  const { multiSeries, singleValue } = getDataCapabilityComponents();
  const multiList = multiSeries.length ? multiSeries.join(", ") : "PieChart";
  const singleList = singleValue.length ? singleValue.join(", ") : "Progress";
  return `DATA CAPABILITY (per registry): Components that accept multi-series data (slices/distribution): ${multiList}. Components that accept a single numeric value (0-100): ${singleList}. If the user describes multiple segments/slices/distribution (e.g. 40% A, 35% B, 25% C) → use a component that accepts multi-series data and set componentProps.data: [{ name, value }, ...]. If the user describes a single percentage → use a component that accepts single-value and set componentProps.value.`;
}

/** Compound structures: intent → required component hierarchy (for prompt text) */
export const COMPOUND_STRUCTURES = {
  tooltip:
    "TooltipProvider > Tooltip > [ TooltipTrigger (wraps the trigger element, e.g. Button), TooltipContent (tooltip text as children) ]. Never use Label with a tooltip prop.",
  alert:
    "Alert > [ AlertTitle, AlertDescription ]. Put title text in AlertTitle children, description in AlertDescription children.",
  tabs: "Tabs > TabsList (with TabsTrigger per tab) + TabsContent per tab.",
  accordion:
    "Accordion > AccordionItem(s) > AccordionTrigger + AccordionContent.",
  dialog:
    "Dialog > DialogTrigger (optional) + DialogContent > DialogHeader, DialogTitle, DialogDescription.",
  breadcrumb:
    "Breadcrumb > BreadcrumbList > BreadcrumbItem > BreadcrumbLink or BreadcrumbPage.",
  avatar:
    "Avatar MUST have children as an ARRAY of components: at least AvatarFallback (children = initials string). Optionally include AvatarImage first with componentProps.src and componentProps.alt. Never use Avatar with string children or empty children.",
  cardWithTitle:
    "Card > Label (children = title). Do NOT use box/container with props.title.",
} as const;

/** Rule for button with tooltip: use Button inside Tooltip, never Label */
export const BUTTON_WITH_TOOLTIP_RULE =
  "For 'button X with tooltip Y': use component Button for the button and wrap it in TooltipProvider > Tooltip > TooltipTrigger (Button X) + TooltipContent (Y). Never use Label for a button; never use a 'tooltip' prop on a component.";

/** Example JSON for button "Save" with tooltip "Save your changes" (can be injected into prompt) */
export const BUTTON_WITH_TOOLTIP_JSON = {
  type: "flex",
  props: {},
  children: [
    {
      type: "component",
      props: { component: "TooltipProvider" },
      children: [
        {
          type: "component",
          props: { component: "Tooltip" },
          children: [
            {
              type: "component",
              props: { component: "TooltipTrigger" },
              children: [
                {
                  type: "component",
                  props: {
                    component: "Button",
                    minWidth: 44,
                    minHeight: 44,
                    "aria-label": "Save",
                  },
                  children: "Save",
                },
              ],
            },
            {
              type: "component",
              props: { component: "TooltipContent" },
              children: "Save your changes",
            },
          ],
        },
      ],
    },
  ],
};

/** Wrong pattern: Label with tooltip prop (must NOT be generated) */
export const TOOLTIP_WRONG_EXAMPLE =
  'WRONG: {"type":"component","props":{"component":"Label","tooltip":"Save your changes"},"children":"Save"} — Label is not a button; tooltip is not a valid prop for this.';

/** Rule: avatar / profile picture → Avatar with children array containing AvatarFallback (and optionally AvatarImage). */
export const AVATAR_RULE =
  "For 'avatar' or 'profile picture': use component Avatar with children as an ARRAY. Include at least one child: component AvatarFallback with children = initials (e.g. 'JD'). If user provides an image URL, add a first child: component AvatarImage with componentProps.src and componentProps.alt. Never use Avatar with children as a string.";

/** Example: Avatar with fallback only (initials). Use this structure so the renderer displays the avatar correctly. */
export const AVATAR_JSON = {
  type: "component",
  props: { component: "Avatar" },
  children: [
    { type: "component", props: { component: "AvatarFallback" }, children: "JD" },
  ],
};

/** Example: Avatar with image and fallback (fallback shows when image fails). */
export const AVATAR_WITH_IMAGE_JSON = {
  type: "component",
  props: { component: "Avatar" },
  children: [
    {
      type: "component",
      props: {
        component: "AvatarImage",
        componentProps: { src: "https://example.com/photo.jpg", alt: "User" },
      },
    },
    { type: "component", props: { component: "AvatarFallback" }, children: "JD" },
  ],
};

/** Wrong: Avatar with string children (will not render correctly). */
export const AVATAR_WRONG_EXAMPLE =
  'WRONG: {"type":"component","props":{"component":"Avatar"},"children":"JD"} — Avatar children must be an array of AvatarImage and/or AvatarFallback components, not a string.';

/** One-line mapping for key intents so the model always picks the right component */
export const INTENT_TO_COMPONENT: Record<string, string> = {
  button: "Button",
  "button with tooltip": "TooltipProvider + Tooltip + TooltipTrigger(Button) + TooltipContent",
  tooltip: "TooltipProvider + Tooltip + TooltipTrigger + TooltipContent",
  input: "Input",
  label: "Label",
  alert: "Alert + AlertTitle + AlertDescription",
  card: "Card",
  dropdown: "Select",
  select: "Select",
  checkbox: "Checkbox",
  "radio buttons": "RadioGroup + RadioGroupItem",
  "pie chart": "PieChart",
  "pie chart showing distribution": "PieChart",
  "distribution chart": "PieChart",
  "progress bar": "Progress",
};

/** Rule: pie chart / distribution with segments → PieChart with data array; never Progress */
export const PIE_CHART_RULE =
  "For 'pie chart', 'distribution', or 'slices' with multiple segments (e.g. 40% A, 35% B, 25% C): use component PieChart with componentProps.data as an array of { name: string, value: number }. Do NOT use Progress — Progress is only for a single progress bar (one value 0-100).";

/** Example JSON for pie chart with 3 slices (for prompt injection) */
export const PIE_CHART_JSON = {
  type: "component",
  props: {
    component: "PieChart",
    componentProps: {
      width: 320,
      height: 280,
      data: [
        { name: "A", value: 40 },
        { name: "B", value: 35 },
        { name: "C", value: 25 },
      ],
    },
  },
  children: [],
};
