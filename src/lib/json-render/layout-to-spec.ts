/**
 * Converts the legacy LayoutNode tree (nested) to json-render Spec (flat root + elements).
 * Enables using the React Renderer for existing layout JSON files.
 */

export interface LayoutNode {
  type: string
  props?: Record<string, unknown>
  children?: LayoutNode[] | string
}

export interface JsonRenderSpec {
  root: string
  elements: Record<string, { type: string; props: Record<string, unknown>; children?: string[] }>
}

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

function getComponentName(props: Record<string, unknown>): string | null {
  const name = (props.componentName ?? props.component) as string | undefined
  return name && typeof name === 'string' ? name : null
}

/**
 * Convert a nested LayoutNode to a flat json-render Spec.
 * Layout types (flex, grid, box, container, stack) map to Stack or Box; component maps to catalog type.
 */
export function layoutNodeToSpec(node: LayoutNode): JsonRenderSpec {
  idCounter = 0
  const elements: JsonRenderSpec['elements'] = {}

  function walk(n: LayoutNode, prefix: string): string {
    const id = nextId(prefix)
    const props = n.props ?? {}
    const p = props as Record<string, unknown>

    let type: string
    let specProps: Record<string, unknown> = {}

    switch (n.type) {
      case 'flex':
        type = 'Stack'
        specProps = {
          direction: (p.direction as string) === 'column' ? 'vertical' : 'horizontal',
          gap: p.gap,
          align: p.align,
          justify: p.justify,
        }
        break
      case 'stack':
        type = 'Stack'
        specProps = {
          direction: (p.direction as string) === 'column' ? 'vertical' : 'horizontal',
          gap: p.gap,
          align: p.align,
          justify: p.justify,
        }
        break
      case 'box':
      case 'container':
      case 'grid':
        type = 'Box'
        specProps = {
          padding: p.padding,
          paddingX: p.paddingX,
          paddingY: p.paddingY,
          className: p.className,
        }
        break
      case 'component': {
        const compName = getComponentName(p)
        type = compName ?? 'Box'
        const componentProps = (p.componentProps as Record<string, unknown>) ?? {}
        specProps = { ...componentProps }
        if (compName === 'Button' && !specProps.label && specProps.children) {
          specProps.label = String(specProps.children)
        }
        if (compName === 'Text' || compName === 'Label') {
          const content = typeof n.children === 'string' ? n.children : (componentProps.content as string)
          if (content) specProps.content = content
        }
        break
      }
      default:
        type = 'Box'
        specProps = { ...p }
    }

    const childIds: string[] = []
    if (n.children != null && Array.isArray(n.children)) {
      for (const child of n.children) {
        if (child && typeof child === 'object' && 'type' in child) {
          childIds.push(walk(child as LayoutNode, type.toLowerCase()))
        }
      }
    }

    elements[id] = { type, props: specProps as Record<string, unknown>, children: childIds }
    return id
  }

  const rootId = walk(node, 'root')
  return { root: rootId, elements }
}

/**
 * Returns true if the value looks like a json-render Spec (has root and elements).
 */
export function isJsonRenderSpec(value: unknown): value is JsonRenderSpec {
  if (value == null || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  return (
    typeof o.root === 'string' &&
    o.elements != null &&
    typeof o.elements === 'object' &&
    !Array.isArray(o.elements)
  )
}

/**
 * Parse JSON content and return a json-render Spec if possible.
 * - If the JSON is already a spec (root + elements), return it.
 * - If the JSON is a legacy layout node (type + props + children), convert and return.
 * - Otherwise return null.
 */
export function parseToSpec(content: string): JsonRenderSpec | null {
  try {
    const parsed = JSON.parse(content) as unknown
    if (isJsonRenderSpec(parsed)) return parsed
    const node = parsed as LayoutNode
    if (node && typeof node === 'object' && typeof node.type === 'string') {
      return layoutNodeToSpec(node)
    }
  } catch {
    // ignore
  }
  return null
}
