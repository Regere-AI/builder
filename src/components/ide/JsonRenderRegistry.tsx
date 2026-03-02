/**
 * json-render registry: maps component types to React renderers.
 * Replaces the previous custom LayoutRenderer by using @json-render/react's Renderer.
 */

import React from 'react'
import type { ComponentRegistry, ComponentRenderProps } from '@json-render/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  buildLayoutStyle,
  formatSpacing,
  formatGridColumns,
  formatGridRows,
  mapAlignValue,
  mapJustifyValue,
} from '@/lib/layoutStyles'

function FlexRender({ element, children }: ComponentRenderProps) {
  const p = (element.props ?? {}) as Record<string, unknown>
  const style = buildLayoutStyle(element.props ?? {}, {
    display: 'flex',
    flexDirection: ((p.direction as string) || 'row') as React.CSSProperties['flexDirection'],
    alignItems: mapAlignValue(p.align as string),
    justifyContent: mapJustifyValue(p.justify as string),
    gap: formatSpacing(p.gap as number | string),
    flexWrap: (p.wrap === true ? 'wrap' : (p.wrap as string) || 'nowrap') as React.CSSProperties['flexWrap'],
  })
  return (
    <div style={style} className={(p.className as string) || undefined}>
      {children}
    </div>
  )
}

function GridRender({ element, children }: ComponentRenderProps) {
  const p = (element.props ?? {}) as Record<string, unknown>
  const style = buildLayoutStyle(element.props ?? {}, {
    display: 'grid',
    gridTemplateColumns: formatGridColumns(p.columns as number | string),
    gridTemplateRows: formatGridRows(p.rows as number | string),
    gap: formatSpacing(p.gap as number | string),
  })
  return (
    <div style={style} className={(p.className as string) || undefined}>
      {children}
    </div>
  )
}

function BoxRender({ element, children }: ComponentRenderProps) {
  const p = (element.props ?? {}) as Record<string, unknown>
  const style = buildLayoutStyle(element.props ?? {}, { display: 'block' })
  return (
    <div style={style} className={(p.className as string) || undefined}>
      {children}
    </div>
  )
}

function StackRender({ element, children }: ComponentRenderProps) {
  const p = (element.props ?? {}) as Record<string, unknown>
  const style = buildLayoutStyle(element.props ?? {}, {
    display: 'flex',
    flexDirection: 'column',
    gap: formatSpacing((p.gap as number) ?? 8),
  })
  return (
    <div style={style} className={(p.className as string) || undefined}>
      {children}
    </div>
  )
}

function ButtonRender({ element, children }: ComponentRenderProps) {
  const props = (element.props ?? {}) as Record<string, unknown>
  return <Button {...props}>{children}</Button>
}

function InputRender({ element }: ComponentRenderProps) {
  const props = (element.props ?? {}) as Record<string, unknown>
  return <Input {...props} />
}

function LabelRender({ element, children }: ComponentRenderProps) {
  const props = (element.props ?? {}) as Record<string, unknown>
  return <Label {...props}>{children}</Label>
}

function TextRender({ element, children }: ComponentRenderProps) {
  const props = (element.props ?? {}) as Record<string, unknown>
  const text = (props.text ?? props.value ?? props.children ?? '') as string
  const content = text ? String(text) : children
  return <Label {...props}>{content}</Label>
}

function CheckboxRender({ element, children }: ComponentRenderProps) {
  const props = (element.props ?? {}) as Record<string, unknown>
  return <Checkbox {...props}>{children}</Checkbox>
}

/** Card: shows title (from props.title) and children so titles display in the layout preview */
function CardRender({ element, children }: ComponentRenderProps) {
  const p = (element.props ?? {}) as Record<string, unknown>
  const title = p.title != null ? String(p.title) : null
  const style = buildLayoutStyle(element.props ?? {}, {
    display: 'block',
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#374151',
    border: '1px solid #4b5563',
  })
  return (
    <div style={style} className={(p.className as string) || undefined}>
      {title != null && (
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#f3f4f6' }}>{title}</div>
      )}
      {children}
    </div>
  )
}

/** CardTitle: render as heading so titles show when used as a child of Card */
function CardTitleRender({ element, children }: ComponentRenderProps) {
  const p = (element.props ?? {}) as Record<string, unknown>
  const text = (p.title ?? p.text ?? p.children ?? '') as string
  const content = typeof text === 'string' && text ? text : children
  return (
    <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
      {content}
    </div>
  )
}

/** Fallback for unknown types: at least show title and children so content is visible */
export function JsonRenderFallback({ element, children }: ComponentRenderProps) {
  const p = (element.props ?? {}) as Record<string, unknown>
  const title = (p.title ?? p.label ?? p.text) != null ? String(p.title ?? p.label ?? p.text) : null
  return (
    <div style={{ padding: 8, border: '1px dashed #666', borderRadius: 4 }}>
      {title != null && <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>}
      {children}
    </div>
  )
}

export const jsonRenderRegistry: ComponentRegistry = {
  Flex: FlexRender,
  Grid: GridRender,
  Box: BoxRender,
  Container: BoxRender,
  Stack: StackRender,
  Button: ButtonRender,
  Input: InputRender,
  Textbox: InputRender,
  Label: LabelRender,
  Text: TextRender,
  Checkbox: CheckboxRender,
  Card: CardRender,
  CardHeader: BoxRender,
  CardTitle: CardTitleRender,
  CardDescription: TextRender,
  CardContent: BoxRender,
  CardFooter: BoxRender,
}
