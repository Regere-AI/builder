/**
 * Shared UI Schema - types, Zod schemas, and registry metadata.
 */

export type {
  LayoutNode,
  LayoutProps,
  ComponentLayoutNode,
  LayoutConfig,
  ResponsiveValue,
  SpacingValue,
  Breakpoint,
  OnLoadConfig,
  OnLoadApiCall,
  OnLoadResult,
  OnLoadError,
  DataSourceConfig,
  FormConfig,
  FormFieldConfig,
  FormFieldType,
  FormFieldValidation,
  FormSectionConfig,
  FormLayoutConfig,
  FormSubmitConfig,
  ApiActionConfig,
  ApiConfig,
  ApiResponse,
  ApiError,
  LayoutRegistryEntry,
  WidgetRegistryEntry,
} from './types';

export {
  LayoutNodeSchema,
  ComponentLayoutNodeSchema,
  validateLayoutNode,
  validateComponentNode,
  isValidLayoutNode,
} from './schemas';

export {
  REGISTRY_METADATA,
  getComponentMetadata,
  getLayoutMetadata,
  getComponentNames,
  getLayoutTypes,
  isValidComponent,
  isValidLayout,
  type ComponentMetadata,
  type LayoutMetadata,
  type ComponentPropMetadata,
  type RegistryMetadata,
} from './registry-metadata';
