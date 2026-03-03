/**
 * Component Registry Metadata
 * 
 * This file provides a static, exportable list of all registered components
 * and layouts with their metadata. This is used by consumers (like UiBuilder)
 * to understand what components are available and what props they accept.
 * 
 * This is a read-only contract - it does not include the actual React components,
 * only metadata about what's available.
 */

/**
 * Metadata about a component's props
 */
export interface ComponentPropMetadata {
  /** Name of the prop */
  name: string;
  /** Type of the prop (simplified string representation) */
  type: string;
  /** Whether the prop is required */
  required?: boolean;
  /** Description of the prop */
  description?: string;
  /** Possible values for enum-like props */
  enum?: string[];
  /** Default value if any */
  default?: any;
}

/**
 * Metadata about a registered component
 */
export interface ComponentMetadata {
  /** Component name (as used in JSON) */
  name: string;
  /** Category of component */
  category: 'basic' | 'form' | 'display' | 'overlay' | 'navigation' | 'chart' | 'layout';
  /** Description of what the component does */
  description?: string;
  /** Common props this component accepts */
  commonProps?: ComponentPropMetadata[];
  /** Whether this component can have children */
  acceptsChildren?: boolean;
}

/**
 * Metadata about a registered layout
 */
export interface LayoutMetadata {
  /** Layout type name (as used in JSON) */
  type: string;
  /** Category of layout */
  category: 'primitive' | 'structural' | 'dashboard' | 'interaction' | 'canvas';
  /** Description of what the layout does */
  description?: string;
  /** Common props this layout accepts */
  commonProps?: ComponentPropMetadata[];
}

/**
 * Complete registry metadata - the contract for what's available
 */
export interface RegistryMetadata {
  /** All registered widget components */
  components: ComponentMetadata[];
  /** All registered layout types */
  layouts: LayoutMetadata[];
  /** Version of this metadata schema */
  version: string;
}

/**
 * Static registry metadata - this is the single source of truth
 * for what components and layouts are available in the UI system.
 * 
 * This should be kept in sync with the actual registrations in
 * register-components.ts and register-layouts.ts
 */
export const REGISTRY_METADATA: RegistryMetadata = {
  version: '1.0.0',
  
  components: [
    // Basic Components
    { name: 'Button', category: 'basic', acceptsChildren: true, commonProps: [
      { name: 'variant', type: 'string', enum: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] },
      { name: 'size', type: 'string', enum: ['default', 'sm', 'lg', 'icon'] },
      { name: 'disabled', type: 'boolean' },
    ]},
    { name: 'ButtonGroup', category: 'basic', acceptsChildren: true },
    { name: 'Input', category: 'form', commonProps: [
      { name: 'type', type: 'string' },
      { name: 'placeholder', type: 'string' },
      { name: 'value', type: 'string' },
      { name: 'disabled', type: 'boolean' },
    ]},
    { name: 'Badge', category: 'basic', acceptsChildren: true },
    
    // Card Components
    { name: 'Card', category: 'basic', acceptsChildren: true },
    { name: 'CardHeader', category: 'basic', acceptsChildren: true },
    { name: 'CardTitle', category: 'basic', acceptsChildren: true },
    { name: 'CardDescription', category: 'basic', acceptsChildren: true },
    { name: 'CardContent', category: 'basic', acceptsChildren: true },
    { name: 'CardFooter', category: 'basic', acceptsChildren: true },
    
    // Alert Components
    { name: 'Alert', category: 'display', acceptsChildren: true },
    { name: 'AlertTitle', category: 'display', acceptsChildren: true },
    { name: 'AlertDescription', category: 'display', acceptsChildren: true },
    
    // Modal/Dialog Components
    { name: 'Modal', category: 'overlay', acceptsChildren: true },
    { name: 'Dialog', category: 'overlay', acceptsChildren: true },
    { name: 'DialogTrigger', category: 'overlay', acceptsChildren: true },
    { name: 'DialogContent', category: 'overlay', acceptsChildren: true },
    { name: 'DialogHeader', category: 'overlay', acceptsChildren: true },
    { name: 'DialogFooter', category: 'overlay', acceptsChildren: true },
    { name: 'DialogTitle', category: 'overlay', acceptsChildren: true },
    { name: 'DialogDescription', category: 'overlay', acceptsChildren: true },
    
    // Form Components
    { name: 'Label', category: 'form', acceptsChildren: true },
    { name: 'Textarea', category: 'form', commonProps: [
      { name: 'placeholder', type: 'string' },
      { name: 'rows', type: 'number' },
    ]},
    { name: 'Select', category: 'form', acceptsChildren: true },
    { name: 'Checkbox', category: 'form', commonProps: [
      { name: 'checked', type: 'boolean' },
    ]},
    { name: 'RadioGroup', category: 'form', acceptsChildren: true },
    { name: 'RadioGroupItem', category: 'form' },
    { name: 'Form', category: 'form', acceptsChildren: true },
    { name: 'Switch', category: 'form', commonProps: [
      { name: 'checked', type: 'boolean' },
    ]},
    { name: 'Slider', category: 'form' },
    { name: 'Progress', category: 'display', commonProps: [
      { name: 'value', type: 'number' },
      { name: 'max', type: 'number' },
    ]},
    
    // Display Components
    { name: 'Spinner', category: 'display' },
    { name: 'Skeleton', category: 'display' },
    { name: 'Separator', category: 'display' },
    { name: 'Avatar', category: 'display', acceptsChildren: true },
    { name: 'AvatarImage', category: 'display', commonProps: [
      { name: 'src', type: 'string', required: true },
      { name: 'alt', type: 'string' },
    ]},
    { name: 'AvatarFallback', category: 'display', acceptsChildren: true },
    { name: 'Table', category: 'display', acceptsChildren: true },
    { name: 'TableHeader', category: 'display', acceptsChildren: true },
    { name: 'TableBody', category: 'display', acceptsChildren: true },
    { name: 'TableFooter', category: 'display', acceptsChildren: true },
    { name: 'TableHead', category: 'display', acceptsChildren: true },
    { name: 'TableRow', category: 'display', acceptsChildren: true },
    { name: 'TableCell', category: 'display', acceptsChildren: true },
    { name: 'TableCaption', category: 'display', acceptsChildren: true },
    
    // Navigation Components
    { name: 'Tabs', category: 'navigation', acceptsChildren: true },
    { name: 'TabsList', category: 'navigation', acceptsChildren: true },
    { name: 'TabsTrigger', category: 'navigation', acceptsChildren: true },
    { name: 'TabsContent', category: 'navigation', acceptsChildren: true },
    { name: 'Accordion', category: 'navigation', acceptsChildren: true },
    { name: 'AccordionItem', category: 'navigation', acceptsChildren: true },
    { name: 'AccordionTrigger', category: 'navigation', acceptsChildren: true },
    { name: 'AccordionContent', category: 'navigation', acceptsChildren: true },
    { name: 'Breadcrumb', category: 'navigation', acceptsChildren: true },
    { name: 'BreadcrumbList', category: 'navigation', acceptsChildren: true },
    { name: 'BreadcrumbItem', category: 'navigation', acceptsChildren: true },
    { name: 'BreadcrumbLink', category: 'navigation', acceptsChildren: true },
    { name: 'BreadcrumbPage', category: 'navigation', acceptsChildren: true },
    { name: 'BreadcrumbSeparator', category: 'navigation' },
    { name: 'BreadcrumbEllipsis', category: 'navigation' },
    
    // Sheet Components
    { name: 'Sheet', category: 'overlay', acceptsChildren: true },
    { name: 'SheetTrigger', category: 'overlay', acceptsChildren: true },
    { name: 'SheetClose', category: 'overlay' },
    { name: 'SheetContent', category: 'overlay', acceptsChildren: true },
    { name: 'SheetHeader', category: 'overlay', acceptsChildren: true },
    { name: 'SheetFooter', category: 'overlay', acceptsChildren: true },
    { name: 'SheetTitle', category: 'overlay', acceptsChildren: true },
    { name: 'SheetDescription', category: 'overlay', acceptsChildren: true },
    
    // Command Components
    { name: 'Command', category: 'display', acceptsChildren: true },
    { name: 'CommandInput', category: 'form' },
    { name: 'CommandList', category: 'display', acceptsChildren: true },
    { name: 'CommandEmpty', category: 'display', acceptsChildren: true },
    { name: 'CommandGroup', category: 'display', acceptsChildren: true },
    { name: 'CommandItem', category: 'display', acceptsChildren: true },
    { name: 'CommandShortcut', category: 'display', acceptsChildren: true },
    { name: 'CommandSeparator', category: 'display' },
    
    // Overlay Components
    { name: 'Popover', category: 'overlay', acceptsChildren: true },
    { name: 'PopoverTrigger', category: 'overlay', acceptsChildren: true },
    { name: 'PopoverContent', category: 'overlay', acceptsChildren: true },
    { name: 'Tooltip', category: 'overlay', acceptsChildren: true },
    { name: 'TooltipTrigger', category: 'overlay', acceptsChildren: true },
    { name: 'TooltipContent', category: 'overlay', acceptsChildren: true },
    { name: 'TooltipProvider', category: 'overlay', acceptsChildren: true },
    { name: 'DropdownMenu', category: 'overlay', acceptsChildren: true },
    { name: 'DropdownMenuTrigger', category: 'overlay', acceptsChildren: true },
    { name: 'DropdownMenuContent', category: 'overlay', acceptsChildren: true },
    { name: 'DropdownMenuItem', category: 'overlay', acceptsChildren: true },
    { name: 'DropdownMenuCheckboxItem', category: 'overlay' },
    { name: 'DropdownMenuRadioItem', category: 'overlay' },
    { name: 'DropdownMenuLabel', category: 'overlay', acceptsChildren: true },
    { name: 'DropdownMenuSeparator', category: 'overlay' },
    { name: 'DropdownMenuShortcut', category: 'overlay', acceptsChildren: true },
    { name: 'DropdownMenuGroup', category: 'overlay', acceptsChildren: true },
    { name: 'DropdownMenuPortal', category: 'overlay', acceptsChildren: true },
    { name: 'DropdownMenuSub', category: 'overlay', acceptsChildren: true },
    { name: 'DropdownMenuSubContent', category: 'overlay', acceptsChildren: true },
    { name: 'DropdownMenuSubTrigger', category: 'overlay', acceptsChildren: true },
    { name: 'DropdownMenuRadioGroup', category: 'overlay', acceptsChildren: true },
    { name: 'ToastProvider', category: 'overlay', acceptsChildren: true },
    { name: 'ToastViewport', category: 'overlay' },
    { name: 'Toast', category: 'overlay', acceptsChildren: true },
    { name: 'ToastTitle', category: 'overlay', acceptsChildren: true },
    { name: 'ToastDescription', category: 'overlay', acceptsChildren: true },
    { name: 'ToastClose', category: 'overlay' },
    { name: 'ToastAction', category: 'overlay', acceptsChildren: true },
    
    // Chart Components
    { name: 'LineChart', category: 'chart', commonProps: [
      { name: 'data', type: 'array', required: true },
    ]},
    { name: 'BarChart', category: 'chart', commonProps: [
      { name: 'data', type: 'array', required: true },
    ]},
    { name: 'PieChart', category: 'chart', commonProps: [
      { name: 'data', type: 'array', required: true },
    ]},
    { name: 'AreaChart', category: 'chart', commonProps: [
      { name: 'data', type: 'array', required: true },
    ]},
    { name: 'RadarChart', category: 'chart', commonProps: [
      { name: 'data', type: 'array', required: true },
    ]},
    { name: 'ComposedChart', category: 'chart', commonProps: [
      { name: 'data', type: 'array', required: true },
    ]},
    
    // Layout Components (used as widgets)
    { name: 'Box', category: 'layout', acceptsChildren: true },
  ],
  
  layouts: [
    // Core Layout Primitives
    { type: 'box', category: 'primitive', description: 'Basic container with optional styling' },
    { type: 'flex', category: 'primitive', description: 'Flexbox layout', commonProps: [
      { name: 'direction', type: 'string', enum: ['row', 'column', 'row-reverse', 'column-reverse'] },
      { name: 'align', type: 'string', enum: ['start', 'end', 'center', 'stretch', 'baseline'] },
      { name: 'justify', type: 'string', enum: ['start', 'end', 'center', 'between', 'around', 'evenly'] },
      { name: 'gap', type: 'number | string' },
    ]},
    { type: 'grid', category: 'primitive', description: 'CSS Grid layout', commonProps: [
      { name: 'columns', type: 'number | string | ResponsiveValue' },
      { name: 'rows', type: 'number | string | ResponsiveValue' },
      { name: 'gap', type: 'number | string' },
    ]},
    { type: 'stack', category: 'primitive', description: 'Vertical stacking layout' },
    { type: 'container', category: 'primitive', description: 'Responsive container with max-width' },
    { type: 'spacer', category: 'primitive', description: 'Spacing element' },
    
    // Structural Layouts
    { type: 'sidebarLayout', category: 'structural', description: 'Sidebar + main content layout' },
    { type: 'headerFooterLayout', category: 'structural', description: 'Header + content + footer layout' },
    { type: 'splitPane', category: 'structural', description: 'Resizable split panes' },
    { type: 'tabs', category: 'structural', description: 'Tabbed interface layout' },
    { type: 'accordion', category: 'structural', description: 'Accordion interface layout' },
    
    // Dashboard Layouts
    { type: 'autoGridLayout', category: 'dashboard', description: 'Auto-sizing grid layout' },
    { type: 'masonryLayout', category: 'dashboard', description: 'Masonry/Pinterest-style layout' },
    { type: 'responsiveDashboard', category: 'dashboard', description: 'Responsive dashboard grid' },
    { type: 'cardLayout', category: 'dashboard', description: 'Card-based layout' },
    { type: 'sectionLayout', category: 'dashboard', description: 'Sectioned content layout' },
    
    // Interaction-Based Layouts
    { type: 'stepperLayout', category: 'interaction', description: 'Step-by-step wizard layout' },
    { type: 'wizardLayout', category: 'interaction', description: 'Multi-step wizard layout' },
    { type: 'panelLayout', category: 'interaction', description: 'Panel-based interface' },
    { type: 'modalLayout', category: 'interaction', description: 'Modal wrapper layout' },
    
    // Canvas/Design Layouts
    { type: 'freePositionLayout', category: 'canvas', description: 'Free positioning layout' },
    { type: 'dragDropLayout', category: 'canvas', description: 'Drag and drop interface' },
    { type: 'flowLayout', category: 'canvas', description: 'Flow diagram layout' },
  ],
};

/**
 * Get component metadata by name
 */
export function getComponentMetadata(name: string): ComponentMetadata | undefined {
  return REGISTRY_METADATA.components.find(c => c.name === name);
}

/**
 * Get layout metadata by type
 */
export function getLayoutMetadata(type: string): LayoutMetadata | undefined {
  return REGISTRY_METADATA.layouts.find(l => l.type === type);
}

/**
 * Get all component names
 */
export function getComponentNames(): string[] {
  return REGISTRY_METADATA.components.map(c => c.name);
}

/**
 * Get all layout types
 */
export function getLayoutTypes(): string[] {
  return REGISTRY_METADATA.layouts.map(l => l.type);
}

/**
 * Check if a component name is valid
 */
export function isValidComponent(name: string): boolean {
  return REGISTRY_METADATA.components.some(c => c.name === name);
}

/**
 * Check if a layout type is valid
 */
export function isValidLayout(type: string): boolean {
  return REGISTRY_METADATA.layouts.some(l => l.type === type);
}

