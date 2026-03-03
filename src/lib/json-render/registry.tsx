import { defineRegistry, useBoundProp } from '@json-render/react'
import { catalog } from './catalog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

/**
 * React component registry for json-render: maps catalog types to UI components.
 * Use with <Renderer spec={spec} registry={registry} />.
 */
export const { registry } = defineRegistry(catalog, {
  components: {
    Card: ({ props, children }) => (
      <div
        className={cn(
          'rounded-lg border border-[#3e3e3e] bg-[#2d2d2d] p-4',
          props.variant === 'outlined' && 'border-[#3e3e3e]'
        )}
      >
        {props.title != null && props.title !== '' && (
          <h2 className="text-sm font-semibold text-gray-200 mb-1">{props.title}</h2>
        )}
        {props.description != null && props.description !== '' && (
          <p className="text-xs text-gray-500 mb-2">{props.description}</p>
        )}
        {children}
      </div>
    ),
    CardHeader: ({ children }) => (
      <div className="mb-2">{children}</div>
    ),
    CardTitle: ({ props }) => (
      <h3 className="text-sm font-semibold text-gray-200">{props.content}</h3>
    ),
    CardDescription: ({ props }) => (
      <p className="text-xs text-gray-500 mt-0.5">{props.content}</p>
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
        disabled={props.disabled ?? false}
        onClick={() => emit('press')}
      >
        {props.label}
      </Button>
    ),
    Text: ({ props }) => (
      <p className={cn('text-sm text-gray-300', props.className)}>{props.content}</p>
    ),
    Input: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<string>(props.value, bindings?.value ?? undefined)
      return (
        <Input
          placeholder={props.placeholder ?? undefined}
          type={(props.type ?? 'text') as 'text' | 'password' | 'email' | 'number'}
          disabled={props.disabled ?? false}
          value={value ?? ''}
          onChange={(e) => setValue(e.target.value)}
        />
      )
    },
    Label: ({ props }) => (
      <Label htmlFor={props.htmlFor ?? undefined}>{props.content}</Label>
    ),
    Checkbox: ({ props, emit }) => (
      <Checkbox
        checked={props.checked ?? false}
        disabled={props.disabled ?? false}
        onCheckedChange={() => emit('press')}
      />
    ),
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
        {props.title != null && props.title !== '' && (
          <p className="font-medium mb-1">{props.title}</p>
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
        {props.content}
      </span>
    ),
  },
  actions: {
    submit: async (params) => {
      console.log('Action submit', params)
    },
    navigate: async (params) => {
      if (typeof window !== 'undefined' && params?.url) window.open(params.url as string, '_blank')
    },
    press: async () => {},
  },
})
