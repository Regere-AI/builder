import { defineCatalog } from '@json-render/core'
import { schema } from '@json-render/react/schema'
import { z } from 'zod'

/**
 * Builder catalog for json-render: components and actions the AI can use.
 * Aligns with shared/component-manifest.json and existing UI (Button, Input, Card, etc.).
 */
export const catalog = defineCatalog(schema, {
  components: {
    Card: {
      props: z.object({
        title: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        variant: z.enum(['default', 'outlined']).nullable().optional(),
      }),
      slots: ['default'],
      description: 'Container card for grouping content with optional title',
    },
    CardHeader: {
      props: z.object({}),
      slots: ['default'],
      description: 'Card header section',
    },
    CardTitle: {
      props: z.object({ content: z.string() }),
      description: 'Card title text',
    },
    CardDescription: {
      props: z.object({ content: z.string() }),
      description: 'Card description text',
    },
    CardContent: {
      props: z.object({}),
      slots: ['default'],
      description: 'Card body content',
    },
    CardFooter: {
      props: z.object({}),
      slots: ['default'],
      description: 'Card footer section',
    },
    Button: {
      props: z.object({
        label: z.string(),
        variant: z.enum(['default', 'destructive', 'outline', 'secondary', 'ghost', 'link']).nullable().optional(),
        size: z.enum(['default', 'sm', 'lg', 'icon']).nullable().optional(),
        disabled: z.boolean().nullable().optional(),
      }),
      description: 'Clickable button; use emit("press") for click',
    },
    Text: {
      props: z.object({
        content: z.string(),
        className: z.string().nullable().optional(),
      }),
      description: 'Text paragraph or label',
    },
    Input: {
      props: z.object({
        value: z.string().nullable().optional(),
        placeholder: z.string().nullable().optional(),
        type: z.enum(['text', 'password', 'email', 'number']).nullable().optional(),
        disabled: z.boolean().nullable().optional(),
      }),
      description: 'Text input field; use $bindState on value for two-way binding',
    },
    Label: {
      props: z.object({
        content: z.string(),
        htmlFor: z.string().nullable().optional(),
      }),
      description: 'Form label',
    },
    Checkbox: {
      props: z.object({
        checked: z.boolean().nullable().optional(),
        disabled: z.boolean().nullable().optional(),
      }),
      description: 'Checkbox input',
    },
    Stack: {
      props: z.object({
        direction: z.enum(['vertical', 'horizontal']).nullable().optional(),
        gap: z.union([z.number(), z.string()]).nullable().optional(),
        align: z.enum(['start', 'center', 'end', 'stretch']).nullable().optional(),
        justify: z.enum(['start', 'center', 'end', 'between', 'around']).nullable().optional(),
        className: z.string().nullable().optional(),
      }),
      slots: ['default'],
      description: 'Flex container for stacking children vertically or horizontally',
    },
    Box: {
      props: z.object({
        padding: z.union([z.number(), z.string()]).nullable().optional(),
        paddingX: z.union([z.number(), z.string()]).nullable().optional(),
        paddingY: z.union([z.number(), z.string()]).nullable().optional(),
        className: z.string().nullable().optional(),
      }),
      slots: ['default'],
      description: 'Generic container/box with optional padding',
    },
    Alert: {
      props: z.object({
        title: z.string().nullable().optional(),
        variant: z.enum(['default', 'destructive']).nullable().optional(),
      }),
      slots: ['default'],
      description: 'Alert or callout box',
    },
    Badge: {
      props: z.object({
        content: z.string(),
        variant: z.enum(['default', 'secondary', 'destructive', 'outline']).nullable().optional(),
      }),
      description: 'Badge or tag',
    },
  },
  actions: {
    submit: {
      params: z.object({ formId: z.string().optional() }),
      description: 'Submit a form',
    },
    navigate: {
      params: z.object({ url: z.string() }),
      description: 'Navigate to a URL',
    },
    press: {
      params: z.object({}),
      description: 'Button or control pressed',
    },
  },
})

export type Catalog = typeof catalog
