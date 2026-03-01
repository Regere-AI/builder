/**
 * @ui-builder/shared - re-exports for convenience.
 * Prefer importing from specific paths e.g. shared/schema, shared/chat-types.
 */

export * from './schema';
export * from './chat-types';
export {
  COMPONENT_MANIFEST,
  REGISTERED_COMPONENT_NAMES,
  getAvailableComponentNames,
  verifyManifestConsistency,
  verifyRegistryHasAllManifestComponents,
  INTERACTIVE_COMPONENT_NAMES,
  isRegisteredComponent,
  isInteractiveComponent,
  COMPONENTS_ACCEPTING_OPTIONS,
  componentAcceptsOptions,
  COMPONENTS_ACCEPTING_MULTI_SERIES,
  COMPONENTS_ACCEPTING_SINGLE_VALUE,
  getDataCapabilityComponents,
  getComponentMeta,
  componentRejectsChildren,
  type ComponentName,
  type ComponentMeta,
  type AcceptsDataCapability,
} from './componentNames';
export * from './component-prompt-mapping';
export * from './component-render-defaults';
export * from './children-to-data';
export type { ComponentRegistry, GetComponent } from './core/registry/types';
