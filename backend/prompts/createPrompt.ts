/**
 * Create UI Prompt Template — general rules for generating UI layout JSON from scratch.
 */

import { formatRulesForPrompt } from "../design-rules";
import { buildRequiredPropsForGeneration } from "../../shared/component-render-defaults";
import { COMPONENTS_ACCEPTING_OPTIONS } from "../../shared/componentNames";
import {
  COMPONENT_NAMES_FOR_PROMPT,
  getDataCapabilityPromptGuidance,
} from "../../shared/component-prompt-mapping";

/**
 * Builds a user prompt for creating a new UI layout from scratch.
 */
export function buildCreateUIPrompt(userPrompt: string): string {
  const designRules = formatRulesForPrompt(["spacing", "accessibility", "consistency"]);

  return `You are a JSON generator. Output valid JSON for UI layouts only.

USER REQUEST: "${userPrompt}"

GENERAL RULES:
1. Output: pure JSON only. No markdown, no explanations. Root object has only "type", "props", "children". No wrapper keys like "buttons", "cards", "ui".
2. Count: "3 buttons" = exactly 3 Button components; "3 plans: Basic, Pro, Enterprise" = exactly 3 cards with those titles. Never reduce or guess counts.
3. Layout: "side by side" / "horizontal" → flex direction "row"; "stacked" / "vertical" → "column"; "grid" → type "grid". Use flex/grid/container/box/stack only; no invented wrappers.
4. Use only component names from the registry. Put all component-specific props in componentProps. Put layout props (direction, gap, columns) in the layout node's props.

COMPONENTS IN REGISTRY (use only these names): ${COMPONENT_NAMES_FOR_PROMPT.join(", ")}

COMPONENT MAPPING (user term → component):
- button → Button (never Label). If "button X with tooltip Y": wrap Button in TooltipProvider > Tooltip > TooltipTrigger(Button) + TooltipContent(Y).
- input / input field → Input; pair with Label in a flex column (Label above, Input below). Each Input: minWidth 44, minHeight 44, aria-label.
- label / text → Label
- textarea → Textarea (same accessibility props as Input)
- card / card with title → Card; put title as a Label child. Do not use type "box" or props.title.
- tag / tags / badge → Badge (never Label for tags). For "N tags: A, B, C..." use N Badge components with those children.
- avatar / profile picture → Avatar with children as an ARRAY: at least AvatarFallback (children = initials); optionally AvatarImage first (componentProps.src, alt). Never Avatar with string children.
- separator / divider → Separator
- checkbox → Checkbox; label text in children. One Checkbox per checkbox (not two Labels).
- dropdown / select → Select; options in componentProps.options.
- radio buttons → RadioGroup + RadioGroupItem
- switch / toggle → Switch; slider → Slider
- alert / notification → Alert with AlertTitle + AlertDescription as children; variant in componentProps.
- progress bar (single value) → Progress with componentProps.value (0-100).
- loading → Spinner or Skeleton
- tooltip (standalone) → TooltipProvider > Tooltip > TooltipTrigger + TooltipContent. For "button with tooltip" use Button inside TooltipTrigger.
- tabs / tabbed interface → Tabs > TabsList (TabsTrigger per tab) + TabsContent per tab.
- accordion / collapsible → Accordion > AccordionItem > AccordionTrigger + AccordionContent
- breadcrumbs → Breadcrumb > BreadcrumbList > BreadcrumbItem > BreadcrumbLink/BreadcrumbPage
- sidebar navigation → SideNavigation
- table → Table > TableHeader, TableBody, TableRow, TableCell. Data table → DataTable (componentProps.columns, data).
- chart / pie chart / distribution / slices → Use a chart component (PieChart, BarChart, etc.) with componentProps.data array (e.g. [{ name: "A", value: 40 }, ...]). BarChart also needs componentProps.bars (e.g. [{ dataKey: "value", name: "Value" }]). Never use Progress for multi-segment distribution.
- modal / dialog → Dialog > DialogTrigger (optional) + DialogContent > DialogHeader, DialogTitle, DialogDescription. Popover → Popover > PopoverTrigger + PopoverContent.

STRUCTURE RULES:
- When the user requests a specific number or list of items (e.g. N buttons, N cards, named items), output exactly that many components with the requested labels as children; use a flex row for horizontal layout or column for vertical. Never return empty children when the user specifies items to create.
- Input block: flex column, gap 4; children = [ Label (children = field name), Input with minWidth 44, minHeight 44, aria-label ].
- Card with title: Card with one Label child (children = title). For multiple items (e.g. plan cards), one Card per item; each Card children = [ Label, Label, ... Button if requested ].
- Do not add Button components unless the user asks for a button (e.g. "Subscribe button", "Submit", "Cancel"). "Each with Subscribe button" → every card gets one Button with children "Subscribe".
- Compound components: use the full hierarchy (e.g. Alert > AlertTitle + AlertDescription; Tabs > TabsList + TabsContent). One parent, multiple children by type.

OPTIONS (per registry): ${COMPONENTS_ACCEPTING_OPTIONS.join(", ")} — when the user lists options, put all in componentProps.options of that component.

DATA CAPABILITY: ${getDataCapabilityPromptGuidance()}

REQUIRED PROPS FOR CORRECT RENDER: ${buildRequiredPropsForGeneration()}

${designRules}

Generate JSON for: "${userPrompt}"

Remember: exact counts from the user request, registry component names only, required props (minWidth/minHeight/aria-label for interactive), root = type + props + children only. Output only JSON.`;
}
