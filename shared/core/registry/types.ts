import type { ComponentType } from 'react';

/**
 * ComponentRegistry contract
 *
 * Core and the renderer depend on this type only.
 * Host applications provide the actual implementation that maps
 * component names (strings) to concrete React components.
 */
export type ComponentRegistry = Record<string, ComponentType<any>>;

/**
 * Helper function type if consumers prefer a function-style API.
 */
export type GetComponent = (componentName: string) => ComponentType<any>;

