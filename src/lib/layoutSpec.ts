/**
 * Converts our nested LayoutNode tree into json-render's flat Spec format.
 */

export interface LayoutNode {
  type: string
  props?: Record<string, unknown>
  children?: LayoutNode[] | string
}

export interface JsonRenderSpec {
  root: string
  elements: Record<string, { type: string; props?: Record<string, unknown>; children?: string[] }>
}

let idCounter = 0
function nextId(): string {
  return `n${idCounter++}`
}

function layoutNodeToSpecRec(node: LayoutNode, elements: JsonRenderSpec['elements']): string {
  const id = nextId()
  const props = node.props ?? {}
  let type = node.type
  let elementProps: Record<string, unknown> = { ...props }

  if (node.type === 'component') {
    type = (props.component ?? props.componentName ?? 'Box') as string
    const componentProps = (props.componentProps ?? {}) as Record<string, unknown>
    elementProps = { ...componentProps }
  }

  const childrenIds: string[] = []
  const rawChildren = node.children
  if (Array.isArray(rawChildren)) {
    for (const child of rawChildren) {
      if (child != null && typeof child === 'object' && child.type) {
        childrenIds.push(layoutNodeToSpecRec(child as LayoutNode, elements))
      }
    }
  } else if (typeof rawChildren === 'string' && rawChildren.trim() !== '') {
    // String children (e.g. button label, card title text) -> create a Text element so it displays
    const textId = nextId()
    elements[textId] = {
      type: 'Text',
      props: { text: rawChildren },
    }
    childrenIds.push(textId)
  }

  elements[id] = {
    type: type.charAt(0).toUpperCase() + type.slice(1),
    props: Object.keys(elementProps).length > 0 ? elementProps : undefined,
    children: childrenIds.length > 0 ? childrenIds : undefined,
  }
  return id
}

/**
 * Convert a nested LayoutNode (builder format) to json-render flat Spec.
 */
export function layoutNodeToSpec(node: LayoutNode | null | undefined): JsonRenderSpec | null {
  if (!node || typeof node !== 'object' || !node.type) return null
  idCounter = 0
  const elements: JsonRenderSpec['elements'] = {}
  const root = layoutNodeToSpecRec(node, elements)
  return { root, elements }
}
