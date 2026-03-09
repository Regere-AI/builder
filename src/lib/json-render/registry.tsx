import { defineRegistry, useBoundProp } from '@json-render/react'
import { catalog } from './catalog'
import { getJsonRenderState, setJsonRenderState, setValueAtPath } from './zustand-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

/** Resolved display props can be string or expression object; only strings are valid ReactNode. */
function asString(value: string | Record<string, unknown> | null | undefined): string {
  return typeof value === 'string' ? value : ''
}

/** Resolved boolean props can be boolean or expression object; narrow for component props. */
function asBoolean(value: boolean | Record<string, unknown> | null | undefined): boolean {
  return typeof value === 'boolean' ? value : false
}

/**
 * React component registry for json-render: maps catalog types to UI components.
 * Use with <Renderer spec={spec} registry={registry} />.
 * Use handlers(getSetState, getState) for <ActionProvider handlers={...} /> with the Zustand store.
 */
export const { registry, handlers } = defineRegistry(catalog, {
  components: {
    Card: ({ props, children }) => (
      <div
        className={cn(
          'rounded-lg border border-[#3e3e3e] bg-[#2d2d2d] p-4',
          props.variant === 'outlined' && 'border-[#3e3e3e]'
        )}
      >
        {asString(props.title) !== '' && (
          <h2 className="text-sm font-semibold text-gray-200 mb-1">{asString(props.title)}</h2>
        )}
        {asString(props.description) !== '' && (
          <p className="text-xs text-gray-500 mb-2">{asString(props.description)}</p>
        )}
        {children}
      </div>
    ),
    CardHeader: ({ children }) => (
      <div className="mb-2">{children}</div>
    ),
    CardTitle: ({ props }) => (
      <h3 className="text-sm font-semibold text-gray-200">{asString(props.content)}</h3>
    ),
    CardDescription: ({ props }) => (
      <p className="text-xs text-gray-500 mt-0.5">{asString(props.content)}</p>
    ),
    CardContent: ({ children }) => (
      <div className="text-sm text-gray-300">{children}</div>
    ),
    CardFooter: ({ children }) => (
      <div className="mt-3 pt-2 border-t border-[#3e3e3e] flex gap-2">{children}</div>
    ),
    Button: ({ props, emit }) => (
      <Button
        variant={(props.variant ?? 'default') as 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'}
        size={(props.size ?? 'default') as 'default' | 'sm' | 'lg' | 'icon'}
        disabled={asBoolean(props.disabled)}
        onClick={() => emit('press')}
      >
        {asString(props.label)}
      </Button>
    ),
    Text: ({ props }) => (
      <p className={cn('text-sm text-gray-300', props.className)}>{asString(props.content)}</p>
    ),
    Input: ({ props, bindings }) => {
      const resolvedValue = typeof props.value === 'string' ? props.value : undefined
      const [value, setValue] = useBoundProp<string>(resolvedValue, bindings?.value ?? undefined)
      return (
        <Input
          placeholder={props.placeholder ?? undefined}
          type={(props.type ?? 'text') as 'text' | 'password' | 'email' | 'number'}
          disabled={asBoolean(props.disabled)}
          value={value ?? ''}
          onChange={(e) => setValue(e.target.value)}
        />
      )
    },
    Label: ({ props }) => (
      <Label htmlFor={props.htmlFor ?? undefined}>{asString(props.content)}</Label>
    ),
    Checkbox: ({ props, bindings, emit }) => {
      const [checked, setChecked] = useBoundProp<boolean>(asBoolean(props.checked), bindings?.checked ?? undefined)
      return (
        <Checkbox
          checked={checked ?? false}
          disabled={asBoolean(props.disabled)}
          onCheckedChange={(value) => (bindings?.checked != null ? setChecked(!!value) : emit('press'))}
        />
      )
    },
    Stack: ({ props, children }) => (
      <div
        className={cn('flex gap-2', (props as { className?: string }).className)}
        style={{
          flexDirection: props.direction === 'vertical' ? 'column' : 'row',
          gap: typeof props.gap === 'number' ? `${props.gap}px` : props.gap ?? 8,
          alignItems:
            props.align === 'start'
              ? 'flex-start'
              : props.align === 'end'
                ? 'flex-end'
                : props.align === 'center'
                  ? 'center'
                  : props.align === 'stretch'
                    ? 'stretch'
                    : 'flex-start',
          justifyContent:
            props.justify === 'start'
              ? 'flex-start'
              : props.justify === 'end'
                ? 'flex-end'
                : props.justify === 'center'
                  ? 'center'
                  : props.justify === 'between'
                    ? 'space-between'
                    : props.justify === 'around'
                      ? 'space-around'
                      : undefined,
        }}
      >
        {children}
      </div>
    ),
    Box: ({ props, children }) => {
      const p = props as { padding?: number | string; paddingX?: number | string; paddingY?: number | string; className?: string }
      return (
        <div
          className={p.className}
          style={{
            padding: p.padding != null ? (typeof p.padding === 'number' ? `${p.padding}px` : p.padding) : undefined,
            paddingLeft: p.paddingX != null ? (typeof p.paddingX === 'number' ? `${p.paddingX}px` : p.paddingX) : undefined,
            paddingRight: p.paddingX != null ? (typeof p.paddingX === 'number' ? `${p.paddingX}px` : p.paddingX) : undefined,
            paddingTop: p.paddingY != null ? (typeof p.paddingY === 'number' ? `${p.paddingY}px` : p.paddingY) : undefined,
            paddingBottom: p.paddingY != null ? (typeof p.paddingY === 'number' ? `${p.paddingY}px` : p.paddingY) : undefined,
          }}
        >
          {children}
        </div>
      )
    },
    Alert: ({ props, children }) => (
      <div
        className={cn(
          'rounded-md border p-3 text-sm',
          props.variant === 'destructive'
            ? 'border-red-500/50 bg-red-500/10 text-red-400'
            : 'border-[#3e3e3e] bg-[#2d2d2d] text-gray-300'
        )}
      >
        {asString(props.title) !== '' && (
          <p className="font-medium mb-1">{asString(props.title)}</p>
        )}
        {children}
      </div>
    ),
    Badge: ({ props }) => (
      <span
        className={cn(
          'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
          props.variant === 'destructive' && 'bg-red-500/20 text-red-400',
          props.variant === 'secondary' && 'bg-[#3e3e3e] text-gray-300',
          props.variant === 'outline' && 'border border-[#3e3e3e] text-gray-400',
          (!props.variant || props.variant === 'default') && 'bg-[#007acc]/20 text-[#007acc]'
        )}
      >
        {asString(props.content)}
      </span>
    ),
  },
  actions: {
    setState: async (params, setState) => {
      const path = (params as { statePath?: string }).statePath
      const value = (params as { value?: unknown }).value
      if (path) {
        setState?.((prev) => setValueAtPath(prev, path, value))
      }
    },
    trackPress: async (params, setState) => {
      const id = (params as { id?: string }).id ?? ''
      const label = (params as { label?: string }).label ?? ''
      setState?.((prev) => {
        const prevUi = typeof prev?.ui === 'object' && prev.ui !== null ? (prev.ui as Record<string, unknown>) : {}
        const prevButtons = typeof prevUi.buttons === 'object' && prevUi.buttons !== null ? (prevUi.buttons as Record<string, boolean>) : {}
        return {
          ...prev,
          ui: {
            ...prevUi,
            lastAction: id,
            lastActionLabel: label,
            lastAt: Date.now(),
            buttons: { ...prevButtons, ...(id ? { [id]: true } : {}) },
          },
        }
      })
    },
    submit: async (params, setState) => {
      setState?.((prev) => ({ ...prev, formResult: { submitted: true, formId: (params as { formId?: string }).formId } }))
    },
    navigate: async (params) => {
      if (typeof window !== 'undefined' && (params as { url?: string })?.url) {
        window.open((params as { url: string }).url, '_blank')
      }
    },
    press: async () => {},
    ask: async (params, setState) => {
      const question = (params as { question?: string }).question ?? ''
      setState?.((prev) => ({
        ...prev,
        prompt: {
          ...(typeof prev?.prompt === 'object' && prev.prompt !== null ? (prev.prompt as Record<string, unknown>) : {}),
          question,
          response: 'Received. In a full setup this would call your API and return a comprehensive answer (e.g. on cloud strategy, cybersecurity, data governance, disaster recovery, compliance).',
        },
      }))
    },
  },
})

const baseHandlers = handlers(() => setJsonRenderState, () => getJsonRenderState())

type SetStateFn = (u: (p: Record<string, unknown>) => Record<string, unknown>) => void
type ActionHandler = (params: unknown, setState?: SetStateFn) => Promise<void>

/**
 * Wrap all action handlers so every invocation is recorded in state.ui (lastAction, actionLog).
 * So the State panel shows actions from any UI element dynamically, not just those wired in the JSON.
 */
function wrapHandlersToRecordActions(
  h: Record<string, (params: Record<string, unknown>, setState?: SetStateFn) => Promise<void>>
): Record<string, ActionHandler> {
  const wrapped: Record<string, ActionHandler> = {}
  for (const [actionName, fn] of Object.entries(h)) {
    if (typeof fn !== 'function') continue
    wrapped[actionName] = async (params, setState) => {
      setState?.((prev) => {
        const prevUi = typeof prev?.ui === 'object' && prev.ui !== null ? (prev.ui as Record<string, unknown>) : {}
        const log = Array.isArray(prevUi.actionLog) ? (prevUi.actionLog as unknown[]).slice(-49) : []
        log.push({ action: actionName, params, at: Date.now() })
        const elementId = params && typeof params === 'object' && 'id' in params ? (params as { id?: string }).id : undefined
        const prevButtons = typeof prevUi.buttons === 'object' && prevUi.buttons !== null ? (prevUi.buttons as Record<string, boolean>) : {}
        return {
          ...prev,
          ui: {
            ...prevUi,
            lastAction: actionName,
            lastParams: params,
            lastAt: Date.now(),
            actionLog: log,
            buttons: { ...prevButtons, ...(elementId ? { [elementId]: true } : {}) },
          },
        }
      })
      return fn(params as Record<string, unknown>, setState)
    }
  }
  return wrapped
}

/** ActionProvider-compatible handlers backed by the Zustand StateStore; all invocations are recorded in state.ui. */
export const jsonRenderActionHandlers = wrapHandlersToRecordActions(baseHandlers)
