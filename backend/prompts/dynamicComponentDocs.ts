/**
 * Dynamic Component Documentation Generator
 * 
 * Reads component-manifest.json and generates documentation dynamically.
 * This ensures the LLM knows about all component properties and can modify them.
 */

import { COMPONENT_MANIFEST } from '../../shared/componentNames';

export interface ComponentInfo {
  name: string;
  props: string[];
  variants?: string[];
  sizes?: string[];
  interactive?: boolean;
  acceptsData?: string;
  dataSchema?: string;
  acceptsOptions?: boolean;
  acceptsChildren?: boolean;
  requiredProps?: string[];
  structure?: string;
}

/**
 * Get detailed information about all components from the manifest
 */
export function getComponentsInfo(): ComponentInfo[] {
  return Object.entries(COMPONENT_MANIFEST).map(([name, config]) => ({
    name,
    props: config.props || [],
    variants: (config as any).variants,
    sizes: (config as any).sizes,
    interactive: (config as any).interactive,
    acceptsData: (config as any).acceptsData,
    dataSchema: (config as any).dataSchema,
    acceptsOptions: (config as any).acceptsOptions,
    acceptsChildren: (config as any).acceptsChildren,
    requiredProps: (config as any).requiredProps,
    structure: (config as any).structure,
  }));
}

/**
 * Generate component documentation for the system prompt
 */
export function generateComponentDocumentation(): string {
  const components = getComponentsInfo();
  
  // Group components by category
  const categories: Record<string, ComponentInfo[]> = {
    'Interactive Components': [],
    'Data Visualization': [],
    'Layout Components': [],
    'Other Components': [],
  };

  components.forEach(comp => {
    if (comp.interactive) {
      categories['Interactive Components'].push(comp);
    } else if (comp.acceptsData) {
      categories['Data Visualization'].push(comp);
    } else if (comp.name.includes('Layout') || ['Box', 'Container', 'Flex', 'Grid', 'Stack'].includes(comp.name)) {
      categories['Layout Components'].push(comp);
    } else {
      categories['Other Components'].push(comp);
    }
  });

  let docs = '\nCOMPONENT PROPERTIES (from manifest - these can be modified):\n';
  docs += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  for (const [category, comps] of Object.entries(categories)) {
    if (comps.length === 0) continue;
    
    docs += `${category.toUpperCase()}:\n`;
    
    comps.forEach(comp => {
      docs += `\n• ${comp.name}`;
      
      // Add props
      if (comp.props.length > 0) {
        docs += `\n  Props: ${comp.props.join(', ')}`;
      }
      
      // Add variants
      if (comp.variants && comp.variants.length > 0) {
        docs += `\n  Variants: ${comp.variants.join(', ')}`;
      }
      
      // Add sizes
      if (comp.sizes && comp.sizes.length > 0) {
        docs += `\n  Sizes: ${comp.sizes.join(', ')}`;
      }
      
      // Add data info
      if (comp.acceptsData) {
        docs += `\n  Accepts Data: ${comp.acceptsData}`;
        if (comp.dataSchema) {
          docs += `\n  Data Schema: ${comp.dataSchema}`;
        }
      }
      
      // Add options info
      if (comp.acceptsOptions) {
        docs += `\n  Accepts Options: Yes (use componentProps.options)`;
      }
      
      // Add structure info
      if (comp.structure === 'leaf') {
        docs += `\n  Structure: Leaf (no children allowed)`;
      }
      
      // Add required props
      if (comp.requiredProps && comp.requiredProps.length > 0) {
        docs += `\n  Required Props: ${comp.requiredProps.join(', ')}`;
      }
    });
    
    docs += '\n\n';
  }

  return docs;
}

/**
 * Generate examples showing how to use component properties
 */
export function generatePropertyExamples(): string {
  const components = getComponentsInfo();
  
  let examples = '\nPROPERTY USAGE EXAMPLES:\n';
  examples += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  // Button with variants
  const button = components.find(c => c.name === 'Button');
  if (button && button.variants) {
    examples += 'Button with variant:\n';
    examples += '{"type": "component", "props": {"component": "Button", "componentProps": {"variant": "destructive"}}, "children": "Delete"}\n\n';
  }

  // Card with variant
  const card = components.find(c => c.name === 'Card');
  if (card && card.props.includes('variant')) {
    examples += 'Card with variant:\n';
    examples += '{"type": "component", "props": {"component": "Card", "componentProps": {"variant": "outlined"}}, "children": [...]}\n\n';
  }

  // Select with options
  const select = components.find(c => c.name === 'Select');
  if (select && select.acceptsOptions) {
    examples += 'Select with options:\n';
    examples += '{"type": "component", "props": {"component": "Select", "componentProps": {"options": [{"value": "1", "label": "Option 1"}, {"value": "2", "label": "Option 2"}], "placeholder": "Choose..."}}}\n\n';
  }

  // Progress with value
  const progress = components.find(c => c.name === 'Progress');
  if (progress && progress.acceptsData) {
    examples += 'Progress with value:\n';
    examples += '{"type": "component", "props": {"component": "Progress", "componentProps": {"value": 75}}}\n\n';
  }

  // PieChart with data
  const pieChart = components.find(c => c.name === 'PieChart');
  if (pieChart && pieChart.acceptsData) {
    examples += 'PieChart with data and colors:\n';
    examples += '{"type": "component", "props": {"component": "PieChart", "componentProps": {"data": [{"name": "A", "value": 40, "fill": "#ff0000"}, {"name": "B", "value": 35, "fill": "#00ff00"}, {"name": "C", "value": 25, "fill": "#0000ff"}]}}}\n\n';
  }

  // Input with placeholder
  const input = components.find(c => c.name === 'Input');
  if (input && input.props.includes('placeholder')) {
    examples += 'Input with placeholder and type:\n';
    examples += '{"type": "component", "props": {"component": "Input", "componentProps": {"placeholder": "Enter email", "type": "email"}}}\n\n';
  }

  examples += 'MODIFYING PROPERTIES:\n';
  examples += 'To change a property, use a patch operation targeting the componentProps:\n';
  examples += '{"op": "replace", "path": "/children/0/props/componentProps/variant", "value": "destructive"}\n';
  examples += '{"op": "replace", "path": "/children/0/props/componentProps/data/0/fill", "value": "#ff0000"}\n\n';

  return examples;
}

/**
 * Get all components that accept specific property types
 */
export function getComponentsByProperty(propertyType: 'variants' | 'sizes' | 'acceptsData' | 'acceptsOptions'): string[] {
  const components = getComponentsInfo();
  return components
    .filter(c => {
      if (propertyType === 'variants') return c.variants && c.variants.length > 0;
      if (propertyType === 'sizes') return c.sizes && c.sizes.length > 0;
      if (propertyType === 'acceptsData') return c.acceptsData;
      if (propertyType === 'acceptsOptions') return c.acceptsOptions;
      return false;
    })
    .map(c => c.name);
}

/**
 * Generate a complete component reference for the LLM
 */
export function generateCompleteComponentReference(): string {
  let reference = 'COMPLETE COMPONENT REFERENCE (dynamically generated from manifest):\n';
  reference += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  
  reference += generateComponentDocumentation();
  reference += generatePropertyExamples();
  
  reference += '\nKEY PRINCIPLES:\n';
  reference += '1. ALL properties listed above can be modified using componentProps\n';
  reference += '2. Use componentProps object to pass properties to components\n';
  reference += '3. For data visualization (charts), use componentProps.data with proper schema\n';
  reference += '4. For interactive components, use componentProps for variants, sizes, disabled, etc.\n';
  reference += '5. Colors can be modified in data arrays (e.g., chart data with "fill" property)\n';
  reference += '6. To modify a property, target the path: /children/[index]/props/componentProps/[propertyName]\n\n';
  
  return reference;
}
