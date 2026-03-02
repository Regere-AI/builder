/**
 * Layout style helpers for json-render registry (Flex, Grid, Box, Stack).
 * Extracted from the previous custom LayoutRenderer.
 */

import type React from 'react'

export function formatSpacing(value?: number | string): string | undefined {
  if (value === undefined) return undefined
  return typeof value === 'number' ? `${value}px` : String(value)
}

export function formatSize(value?: number | string): string | undefined {
  if (value === undefined) return undefined
  return typeof value === 'number' ? `${value}px` : String(value)
}

export function mapAlignValue(align?: string): React.CSSProperties['alignItems'] {
  switch (align) {
    case 'start': return 'flex-start'
    case 'end': return 'flex-end'
    case 'center': return 'center'
    case 'stretch': return 'stretch'
    case 'baseline': return 'baseline'
    default: return undefined
  }
}

export function mapJustifyValue(justify?: string): React.CSSProperties['justifyContent'] {
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

export function formatGridColumns(columns?: number | string): string | undefined {
  if (columns === undefined) return undefined
  if (typeof columns === 'number') return `repeat(${columns}, 1fr)`
  return String(columns)
}

export function formatGridRows(rows?: number | string): string | undefined {
  if (rows === undefined) return undefined
  if (typeof rows === 'number') return `repeat(${rows}, 1fr)`
  return String(rows)
}

export function buildLayoutStyle(props: Record<string, unknown>, baseStyle: React.CSSProperties = {}): React.CSSProperties {
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
