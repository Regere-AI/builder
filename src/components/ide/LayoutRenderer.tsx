import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

export interface LayoutNode {
  type: string
  props?: Record<string, unknown>
  children?: LayoutNode[] | string
}

export type ComponentRegistry = Record<string, React.ComponentType<any>>

const InheritedStyleContext = React.createContext<React.CSSProperties>({})

function getInheritableStyle(props: Record<string, unknown>): React.CSSProperties {
  const s: React.CSSProperties = {}
  if (props.style != null && typeof props.style === 'object') {
    Object.assign(s, props.style as React.CSSProperties)
  }
  if (props.color != null && props.color !== '') s.color = String(props.color)
  if (props.backgroundColor != null && props.backgroundColor !== '') s.backgroundColor = String(props.backgroundColor)
  return s
}

function formatSpacing(value?: number | string): string | undefined {
  if (value === undefined) return undefined
  return typeof value === 'number' ? `${value}px` : String(value)
}

function formatSize(value?: number | string): string | undefined {
  if (value === undefined) return undefined
  return typeof value === 'number' ? `${value}px` : String(value)
}

function mapAlignValue(align?: string): React.CSSProperties['alignItems'] {
  switch (align) {
    case 'start': return 'flex-start'
    case 'end': return 'flex-end'
    case 'center': return 'center'
    case 'stretch': return 'stretch'
    case 'baseline': return 'baseline'
    default: return undefined
  }
}

function mapJustifyValue(justify?: string): React.CSSProperties['justifyContent'] {
  switch (justify) {
    case 'start': return 'flex-start'
    case 'end': return 'flex-end'
    case 'center': return 'center'
    case 'between': return 'space-between'
    case 'around': return 'space-around'
    case 'evenly': return 'space-evenly'
    default: return undefined
  }
}

function formatGridColumns(columns?: number | string): string | undefined {
  if (columns === undefined) return undefined
  if (typeof columns === 'number') return `repeat(${columns}, 1fr)`
  return String(columns)
}

function formatGridRows(rows?: number | string): string | undefined {
  if (rows === undefined) return undefined
  if (typeof rows === 'number') return `repeat(${rows}, 1fr)`
  return String(rows)
}

function buildLayoutStyle(props: Record<string, unknown>, baseStyle: React.CSSProperties = {}): React.CSSProperties {
  const style: React.CSSProperties = { ...baseStyle }
  const p = props as Record<string, unknown>
  if (p.padding) style.padding = formatSpacing(p.padding as number | string)
  if (p.paddingX) {
    style.paddingLeft = formatSpacing(p.paddingX as number | string)
    style.paddingRight = formatSpacing(p.paddingX as number | string)
  }
  if (p.paddingY) {
    style.paddingTop = formatSpacing(p.paddingY as number | string)
    style.paddingBottom = formatSpacing(p.paddingY as number | string)
  }
  if (p.margin) style.margin = formatSpacing(p.margin as number | string)
  if (p.marginX) {
    style.marginLeft = formatSpacing(p.marginX as number | string)
    style.marginRight = formatSpacing(p.marginX as number | string)
  }
  if (p.marginY) {
    style.marginTop = formatSpacing(p.marginY as number | string)
    style.marginBottom = formatSpacing(p.marginY as number | string)
  }
  if (p.width) style.width = formatSize(p.width as number | string)
  if (p.height) style.height = formatSize(p.height as number | string)
  if (p.minWidth) style.minWidth = formatSize(p.minWidth as number | string)
  if (p.minHeight) style.minHeight = formatSize(p.minHeight as number | string)
  if (p.maxWidth) style.maxWidth = formatSize(p.maxWidth as number | string)
  if (p.maxHeight) style.maxHeight = formatSize(p.maxHeight as number | string)
  if (p.background) style.backgroundColor = String(p.background)
  if (p.border) {
    style.border = typeof p.border === 'boolean' ? '1px solid #e2e8f0' : String(p.border)
  }
  if (p.borderRadius) style.borderRadius = formatSize(p.borderRadius as number | string)
  if (p.shadow) {
    const shadows: Record<string, string> = {
      sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
      lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
      xl: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
      '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    }
    style.boxShadow = typeof p.shadow === 'boolean' ? shadows.md : (shadows[String(p.shadow)] ?? String(p.shadow))
  }
  if (p.fontSize) style.fontSize = formatSize(p.fontSize as number | string)
  if (p.fontWeight) style.fontWeight = p.fontWeight as React.CSSProperties['fontWeight']
  if (p.color) style.color = String(p.color)
  if (p.textAlign) style.textAlign = p.textAlign as React.CSSProperties['textAlign']
  return style
}

function renderChildren(
  children: LayoutNode[] | string | undefined,
  registry: ComponentRegistry
): React.ReactNode {
  if (children === undefined || children === null) return null
  if (typeof children === 'string') return children
  const list = Array.isArray(children) ? children : []
  return list
    .filter((child): child is LayoutNode => child != null && typeof child === 'object')
    .map((child, index) => <LayoutRenderer key={index} node={child} registry={registry} />)
}

interface LayoutRendererProps {
  node: LayoutNode
  registry: ComponentRegistry
}

export const LayoutRenderer: React.FC<LayoutRendererProps> = ({ node, registry }) => {
  if (!node || typeof node !== 'object') return null
  const { type, props = {}, children } = node

  switch (type) {
    case 'flex':
      return <FlexContainer props={props} children={children} registry={registry} />
    case 'grid':
      return <GridContainer props={props} children={children} registry={registry} />
    case 'box':
    case 'container':
      return <BoxContainer props={props} children={children} registry={registry} />
    case 'stack':
      return <StackContainer props={props} children={children} registry={registry} />
    case 'component':
      return <ComponentRenderer props={props} children={children} registry={registry} />
    default:
      return <UnknownTypeRenderer type={type} props={props} children={children} registry={registry} />
  }
}

const FlexContainer: React.FC<{
  props: Record<string, unknown>
  children?: LayoutNode[] | string
  registry: ComponentRegistry
}> = ({ props, children, registry }) => {
  const p = props as Record<string, unknown>
  const style = buildLayoutStyle(props, {
    display: 'flex',
    flexDirection: ((p.direction as string) || 'row') as React.CSSProperties['flexDirection'],
    alignItems: mapAlignValue(p.align as string),
    justifyContent: mapJustifyValue(p.justify as string),
    gap: formatSpacing(p.gap as number | string),
    flexWrap: (p.wrap === true ? 'wrap' : (p.wrap as string) || 'nowrap') as React.CSSProperties['flexWrap'],
  })
  const inheritedStyle = getInheritableStyle(props)
  return (
    <div style={style} className={(p.className as string) || undefined}>
      <InheritedStyleContext.Provider value={inheritedStyle}>
        {renderChildren(children, registry)}
      </InheritedStyleContext.Provider>
    </div>
  )
}

const GridContainer: React.FC<{
  props: Record<string, unknown>
  children?: LayoutNode[] | string
  registry: ComponentRegistry
}> = ({ props, children, registry }) => {
  const p = props as Record<string, unknown>
  const style = buildLayoutStyle(props, {
    display: 'grid',
    gridTemplateColumns: formatGridColumns(p.columns as number | string),
    gridTemplateRows: formatGridRows(p.rows as number | string),
    gap: formatSpacing(p.gap as number | string),
  })
  const inheritedStyle = getInheritableStyle(props)
  return (
    <div style={style} className={(p.className as string) || undefined}>
      <InheritedStyleContext.Provider value={inheritedStyle}>
        {renderChildren(children, registry)}
      </InheritedStyleContext.Provider>
    </div>
  )
}

const BoxContainer: React.FC<{
  props: Record<string, unknown>
  children?: LayoutNode[] | string
  registry: ComponentRegistry
}> = ({ props, children, registry }) => {
  const p = props as Record<string, unknown>
  const style = buildLayoutStyle(props, { display: 'block' })
  const inheritedStyle = getInheritableStyle(props)
  return (
    <div style={style} className={(p.className as string) || undefined}>
      <InheritedStyleContext.Provider value={inheritedStyle}>
        {renderChildren(children, registry)}
      </InheritedStyleContext.Provider>
    </div>
  )
}

const StackContainer: React.FC<{
  props: Record<string, unknown>
  children?: LayoutNode[] | string
  registry: ComponentRegistry
}> = ({ props, children, registry }) => {
  const p = props as Record<string, unknown>
  const style = buildLayoutStyle(props, {
    display: 'flex',
    flexDirection: 'column',
    gap: formatSpacing((p.gap as number) ?? 8),
  })
  const inheritedStyle = getInheritableStyle(props)
  return (
    <div style={style} className={(p.className as string) || undefined}>
      <InheritedStyleContext.Provider value={inheritedStyle}>
        {renderChildren(children, registry)}
      </InheritedStyleContext.Provider>
    </div>
  )
}

function getComponentName(props: Record<string, unknown>, registry: ComponentRegistry): string | null {
  const raw = (props?.component ?? props?.componentName) as string | undefined
  if (raw == null || typeof raw !== 'string' || !raw.trim()) return null
  const trimmed = raw.trim()
  if (registry[trimmed]) return trimmed
  const key = Object.keys(registry).find((k) => k.toLowerCase() === trimmed.toLowerCase())
  return key ?? trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

const SELF_CLOSING_COMPONENTS = ['Input', 'Textbox', 'Progress', 'Separator']
const COMPONENTS_WITH_EXTERNAL_LABELS = ['Checkbox', 'Switch', 'RadioGroup']
const COMPACT_COMPONENTS = ['Alert', 'Badge', 'Button']

const ComponentRenderer: React.FC<{
  props: Record<string, unknown>
  children?: LayoutNode[] | string
  registry: ComponentRegistry
}> = ({ props, children, registry }) => {
  const inheritedStyle = React.useContext(InheritedStyleContext) || {}
  const componentName = getComponentName(props, registry)
  const p = props as Record<string, unknown>

  if (!componentName) {
    return (
      <div
        style={{
          border: '2px dashed #ff6b6b',
          padding: '8px',
          color: '#ff6b6b',
          backgroundColor: '#fff5f5',
        }}
      >
        Error: Component name not specified
      </div>
    )
  }

  let Component = registry[componentName]
  if (!Component || Component === null || typeof Component === 'undefined') {
    Component = UnknownComponent as React.ComponentType<any>
  }

  const reservedKeys = new Set(['component', 'componentName', 'componentProps'])
  let componentProps: Record<string, unknown> = { ...((p.componentProps as Record<string, unknown>) || {}) }
  for (const [k, v] of Object.entries(p)) {
    if (reservedKeys.has(k) || v === undefined) continue
    if (!(k in componentProps)) componentProps[k] = v
  }

  const mergedStyle: React.CSSProperties = { ...inheritedStyle }
  if (componentProps.style != null && typeof componentProps.style === 'object') {
    Object.assign(mergedStyle, componentProps.style as React.CSSProperties)
  }
  if (p.style != null && typeof p.style === 'object') {
    Object.assign(mergedStyle, p.style as React.CSSProperties)
  }
  if (p.color != null && p.color !== '') mergedStyle.color = String(p.color)
  if (p.minWidth != null) mergedStyle.minWidth = formatSize(p.minWidth as number | string)
  if (p.minHeight != null) mergedStyle.minHeight = formatSize(p.minHeight as number | string)
  if (Object.keys(mergedStyle).length > 0) componentProps = { ...componentProps, style: mergedStyle }

  let wrapperStyle = buildLayoutStyle(props)
  if (COMPACT_COMPONENTS.includes(componentName)) {
    wrapperStyle = {
      ...wrapperStyle,
      alignSelf: 'flex-start',
      width: 'fit-content',
      maxWidth: '100%',
    }
  }

  const isRegistered = componentName in registry && registry[componentName] != null && registry[componentName] !== undefined

  if (isRegistered && COMPONENTS_WITH_EXTERNAL_LABELS.includes(componentName)) {
    const labelText = typeof children === 'string' ? children : ''
    return (
      <div style={{ ...wrapperStyle, display: 'flex', alignItems: 'center', gap: '8px' }} className={(p.className as string) || undefined}>
        <Component {...componentProps} />
        {labelText && <label style={{ cursor: 'pointer', userSelect: 'none' }}>{labelText}</label>}
      </div>
    )
  }

  if (isRegistered && SELF_CLOSING_COMPONENTS.includes(componentName)) {
    return (
      <div style={wrapperStyle} className={(p.className as string) || undefined}>
        <Component {...componentProps} />
      </div>
    )
  }

  if (isRegistered) {
    return (
      <div style={wrapperStyle} className={(p.className as string) || undefined}>
        <Component {...componentProps}>{renderChildren(children, registry)}</Component>
      </div>
    )
  }

  return (
    <div style={wrapperStyle} className={(p.className as string) || undefined}>
      <Component componentName={componentName} componentProps={componentProps}>
        {renderChildren(children, registry)}
      </Component>
    </div>
  )
}

const UnknownTypeRenderer: React.FC<{
  type: string
  props: Record<string, unknown>
  children?: LayoutNode[] | string
  registry: ComponentRegistry
}> = ({ type, props, children, registry }) => (
  <div
    style={{
      border: '2px dashed #ff9800',
      padding: '8px',
      backgroundColor: '#fff8e1',
      color: '#e65100',
    }}
  >
    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Unknown Layout Type: {type}</div>
    <div style={{ fontSize: '12px', marginBottom: '8px' }}>Props: {JSON.stringify(props, null, 2)}</div>
    {children && renderChildren(children, registry)}
  </div>
)

const UnknownComponent: React.FC<{
  componentName: string
  componentProps?: Record<string, unknown>
  children?: React.ReactNode
}> = ({ componentName, componentProps, children }) => (
  <div
    style={{
      border: '2px dashed #f59e0b',
      padding: '12px',
      backgroundColor: '#fffbeb',
      borderRadius: '6px',
      margin: '4px 0',
    }}
  >
    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#d97706', marginBottom: '8px' }}>
      Unregistered Component: {componentName}
    </div>
    {componentProps && Object.keys(componentProps).length > 0 && (
      <div
        style={{
          fontSize: '11px',
          color: '#92400e',
          marginBottom: '8px',
          fontFamily: 'monospace',
          backgroundColor: '#fef3c7',
          padding: '4px',
          borderRadius: '3px',
        }}
      >
        Props: {JSON.stringify(componentProps, null, 2)}
      </div>
    )}
    {children && <div style={{ marginTop: '8px' }}>{children}</div>}
  </div>
)

export const defaultLayoutRegistry: ComponentRegistry = {
  Button,
  Input,
  Textbox: Input,
  Label,
  Text: Label,
  Checkbox,
}

export default LayoutRenderer
