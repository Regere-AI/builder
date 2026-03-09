import { defineCatalog } from '@json-render/core'
import { schema } from '@json-render/react/schema'
import { z } from 'zod'

/**
 * Props can be literal values or json-render expressions so specs can use
 * $state, $template, $cond, $item, $index, $bindState, $bindItem in any bindable prop.
 * See https://json-render.dev/docs/data-binding
 */
const exprObject = z.record(z.string(), z.unknown())

/** String prop that can be literal or expression (e.g. { "$state": "/path" }, { "$template": "Hi ${/name}" }). */
export const strProp = z.union([z.string(), exprObject]).nullable().optional()
/** String prop required (literal or expression). */
export const strPropRequired = z.union([z.string(), exprObject])
/** Boolean prop that can be literal or expression (e.g. { "$state": "/checked" }, { "$bindState": "/form/agree" }). */
export const boolProp = z.union([z.boolean(), exprObject]).nullable().optional()
/** Value prop for inputs: literal or $bindState / $state expression. */
export const valueProp = z.union([z.string(), exprObject]).nullable().optional()

/**
 * Builder catalog for json-render: components and actions the AI can use.
 * Aligns with shared/component-manifest.json and existing UI (Button, Input, Card, etc.).
 * Any string/boolean prop above that uses strProp/boolProp/valueProp supports dynamic data binding in the spec.
 */
export const catalog = defineCatalog(schema, {
  components: {
    Card: {
      props: z.object({
        title: strProp,
        description: strProp,
        variant: z.enum(['default', 'outlined']).nullable().optional(),
      }),
      slots: ['default'],
      description: 'Container card for grouping content with optional title. Use $state or $template in title/description for dynamic data.',
    },
    CardHeader: {
      props: z.object({}),
      slots: ['default'],
      description: 'Card header section',
    },
    CardTitle: {
      props: z.object({ content: strPropRequired }),
      description: 'Card title text. Supports $state, $template, $cond in content.',
    },
    CardDescription: {
      props: z.object({ content: strPropRequired }),
      description: 'Card description text. Supports $state, $template, $cond in content.',
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
        label: strPropRequired,
        variant: z.enum(['default', 'destructive', 'outline', 'secondary', 'ghost', 'link']).nullable().optional(),
        size: z.enum(['default', 'sm', 'lg', 'icon']).nullable().optional(),
        disabled: boolProp,
      }),
      description: 'Clickable button. Use on: { press: { action: "setState", params: { statePath: "/path", value: ... } } } so the State panel shows actions; add /state/<path> for any state that buttons or actions update. Label supports $state/$template.',
    },
    Text: {
      props: z.object({
        content: strPropRequired,
        className: z.string().nullable().optional(),
      }),
      description: 'Static text or paragraph only. Do NOT use for form data entry; use Input for any field where the user types. Content supports $state, $template, $cond.',
    },
    Input: {
      props: z.object({
        value: valueProp,
        placeholder: z.string().nullable().optional(),
        type: z.enum(['text', 'password', 'email', 'number']).nullable().optional(),
        disabled: boolProp,
      }),
      description: 'Editable text field for user input. Use Input (not Label or Text) for every form field where the user must type: name, email, phone, etc. Use $bindState on value to bind to state (e.g. /form/name).',
    },
    Label: {
      props: z.object({
        content: strPropRequired,
        htmlFor: z.string().nullable().optional(),
      }),
      description: 'Optional label text displayed above or beside a form control. For data entry fields always add an Input; Label alone does not allow typing. Content supports $state/$template.',
    },
    Checkbox: {
      props: z.object({
        checked: boolProp,
        disabled: boolProp,
      }),
      description: 'Checkbox input. Use checked: { "$bindState": "/path" } for two-way binding, or { "$state": "/path" } for read-only.',
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
        title: strProp,
        variant: z.enum(['default', 'destructive']).nullable().optional(),
      }),
      slots: ['default'],
      description: 'Alert or callout box. Title supports $state, $template, $cond.',
    },
    Badge: {
      props: z.object({
        content: strPropRequired,
        variant: z.enum(['default', 'secondary', 'destructive', 'outline']).nullable().optional(),
      }),
      description: 'Badge or tag. Content supports $state, $template, $cond.',
    },
  },
  actions: {
    setState: {
      params: z.object({
        statePath: z.string().describe('JSON Pointer path, e.g. /ui/lastAction or /form/submitted'),
        value: z.unknown().optional().describe('Value to set; omit to clear'),
      }),
      description: 'Write a value to state at the given path so the State panel reflects it. Use for button clicks, form submitted, etc.',
    },
    trackPress: {
      params: z.object({
        id: z.string().optional().describe('Element id (e.g. btn, save-btn)'),
        label: z.string().optional().describe('Button or control label for display in State panel'),
      }),
      description: 'Record a button or control press in state at /ui/lastAction so the State panel shows the last action.',
    },
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
      description: 'Button or control pressed (no state update); prefer setState or trackPress to show in State panel.',
    },
    ask: {
      params: z.object({
        question: z.string().describe('Strategic or business question (e.g. technology foundation, cloud, security, compliance)'),
      }),
      description: 'Submit a strategic or business question; stores question and response in state for display (e.g. /prompt/question, /prompt/response)',
    },
  },
})

export type Catalog = typeof catalog
