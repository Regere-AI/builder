/**
 * Zod Validation Schemas
 * Runtime-validatable schemas for the UI JSON structure.
 */

import { z } from 'zod';

const ResponsiveValueSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.union([
    itemSchema,
    z.object({
      default: itemSchema.optional(),
      sm: itemSchema.optional(),
      md: itemSchema.optional(),
      lg: itemSchema.optional(),
      xl: itemSchema.optional(),
      '2xl': itemSchema.optional(),
    }),
  ]);

const SpacingValueSchema = z.union([z.number(), z.string()]);

const ApiActionConfigSchema = z.object({
  api: z.string().optional(),
  url: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional(),
  headers: z.record(z.string()).optional(),
  body: z.any().optional(),
  params: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  timeout: z.number().optional(),
  credentials: z.enum(['include', 'omit', 'same-origin']).optional(),
  onSuccess: z.function().optional(),
  onError: z.function().optional(),
  loadingState: z.string().optional(),
  dataState: z.string().optional(),
  errorState: z.string().optional(),
});

const LayoutPropsSchema = z.object({
  gap: ResponsiveValueSchema(SpacingValueSchema).optional(),
  padding: ResponsiveValueSchema(SpacingValueSchema).optional(),
  paddingX: ResponsiveValueSchema(SpacingValueSchema).optional(),
  paddingY: ResponsiveValueSchema(SpacingValueSchema).optional(),
  margin: ResponsiveValueSchema(SpacingValueSchema).optional(),
  marginX: ResponsiveValueSchema(SpacingValueSchema).optional(),
  marginY: ResponsiveValueSchema(SpacingValueSchema).optional(),
  direction: z.enum(['row', 'column', 'row-reverse', 'column-reverse']).optional(),
  align: z.enum(['start', 'end', 'center', 'stretch', 'baseline']).optional(),
  justify: z.enum(['start', 'end', 'center', 'between', 'around', 'evenly']).optional(),
  wrap: z.union([z.boolean(), z.enum(['wrap', 'nowrap', 'wrap-reverse'])]).optional(),
  columns: ResponsiveValueSchema(z.union([z.number(), z.string()])).optional(),
  rows: ResponsiveValueSchema(z.union([z.number(), z.string()])).optional(),
  autoFit: z.boolean().optional(),
  autoFill: z.boolean().optional(),
  width: ResponsiveValueSchema(z.union([z.string(), z.number()])).optional(),
  height: ResponsiveValueSchema(z.union([z.string(), z.number()])).optional(),
  maxWidth: ResponsiveValueSchema(z.union([z.string(), z.number()])).optional(),
  minWidth: ResponsiveValueSchema(z.union([z.string(), z.number()])).optional(),
  maxHeight: ResponsiveValueSchema(z.union([z.string(), z.number()])).optional(),
  minHeight: ResponsiveValueSchema(z.union([z.string(), z.number()])).optional(),
  background: z.string().optional(),
  border: z.union([z.boolean(), z.string()]).optional(),
  borderRadius: z.union([z.string(), z.number()]).optional(),
  shadow: z.union([z.boolean(), z.enum(['sm', 'md', 'lg', 'xl', '2xl', 'none'])]).optional(),
  component: z.string().optional(),
  componentProps: z.record(z.any()).optional(),
  className: z.string().optional(),
  apiAction: ApiActionConfigSchema.optional(),
}).passthrough();

const DataSourceConfigSchema = z.object({
  api: ApiActionConfigSchema.optional(),
  polling: z.object({
    interval: z.number(),
    enabled: z.union([z.boolean(), z.function()]).optional(),
  }).optional(),
  refreshOn: z.array(z.string()).optional(),
});

const OnLoadApiCallSchema = ApiActionConfigSchema.extend({
  id: z.string(),
  dependsOn: z.array(z.string()).optional(),
  required: z.boolean().optional(),
  retry: z.object({
    attempts: z.number(),
    delay: z.number().optional(),
  }).optional(),
});

const OnLoadConfigSchema = z.object({
  apis: z.array(OnLoadApiCallSchema),
  strategy: z.enum(['parallel', 'sequential']).optional(),
  loadingState: z.string().optional(),
  errorState: z.string().optional(),
  onComplete: z.function().optional(),
  onAllSuccess: z.function().optional(),
  onAnyError: z.function().optional(),
});

const BaseLayoutNodeSchema = z.object({
  type: z.string(),
  props: LayoutPropsSchema,
  children: z.array(z.any()).optional(),
  id: z.string().optional(),
  condition: z.union([z.boolean(), z.function()]).optional(),
  visible: z.union([z.boolean(), z.function()]).optional(),
  onLoad: OnLoadConfigSchema.optional(),
  dataSource: DataSourceConfigSchema.optional(),
});

export const LayoutNodeSchema: z.ZodType<any> = z.lazy(() =>
  BaseLayoutNodeSchema.extend({
    children: z.array(LayoutNodeSchema).optional(),
  })
);

export const ComponentLayoutNodeSchema = BaseLayoutNodeSchema.extend({
  type: z.literal('component'),
  props: LayoutPropsSchema.extend({
    component: z.string(),
    componentProps: z.record(z.any()).optional(),
  }),
});

export function validateLayoutNode(data: unknown): { success: boolean; data?: any; error?: z.ZodError } {
  const result = LayoutNodeSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}

export function validateComponentNode(data: unknown): { success: boolean; data?: any; error?: z.ZodError } {
  const result = ComponentLayoutNodeSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}

export function isValidLayoutNode(data: unknown): data is any {
  return LayoutNodeSchema.safeParse(data).success;
}

export type LayoutProps = z.infer<typeof LayoutPropsSchema>;
export type DataSourceConfig = z.infer<typeof DataSourceConfigSchema>;
export type OnLoadConfig = z.infer<typeof OnLoadConfigSchema>;
export type OnLoadApiCall = z.infer<typeof OnLoadApiCallSchema>;
export type ApiActionConfig = z.infer<typeof ApiActionConfigSchema>;
