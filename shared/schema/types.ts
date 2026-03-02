/**
 * Schema types - inferred from Zod schemas + minimal contract types.
 */

export type {
  LayoutProps,
  DataSourceConfig,
  OnLoadConfig,
  OnLoadApiCall,
  ApiActionConfig,
} from './schemas';

import type { z } from 'zod';
import { LayoutNodeSchema, ComponentLayoutNodeSchema } from './schemas';

export type LayoutNode = z.infer<typeof LayoutNodeSchema>;
export type ComponentLayoutNode = z.infer<typeof ComponentLayoutNodeSchema>;

export type ResponsiveValue<T = number | string> = T | { default?: T; sm?: T; md?: T; lg?: T; xl?: T; '2xl'?: T };
export type SpacingValue = number | string;
export type Breakpoint = 'default' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type LayoutConfig = Record<string, unknown>;

export interface OnLoadResult { data?: unknown; error?: string }
export interface OnLoadError { message: string; id?: string }

export interface FormConfig { fields?: FormFieldConfig[]; sections?: FormSectionConfig[]; [key: string]: unknown }
export interface FormFieldConfig { name: string; type?: FormFieldType; label?: string; validation?: FormFieldValidation; [key: string]: unknown }
export type FormFieldType = 'text' | 'number' | 'email' | 'select' | 'checkbox' | 'radio' | string;
export interface FormFieldValidation { required?: boolean; min?: number; max?: number; [key: string]: unknown }
export interface FormSectionConfig { title?: string; fields?: string[]; [key: string]: unknown }
export interface FormLayoutConfig { [key: string]: unknown }
export interface FormSubmitConfig { [key: string]: unknown }

export interface ApiConfig { url?: string; method?: string; [key: string]: unknown }
export interface ApiResponse { data?: unknown; error?: string }
export interface ApiError { message: string; code?: string }

export interface LayoutRegistryEntry { type: string; category?: string; [key: string]: unknown }
export interface WidgetRegistryEntry { name: string; category?: string; [key: string]: unknown }
