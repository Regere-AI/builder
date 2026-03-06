/**
 * Zustand-backed StateStore for json-render (controlled mode).
 * Use this store with <StateProvider store={jsonRenderStateStore}> or
 * <JSONUIProvider store={jsonRenderStateStore} ... />.
 *
 * For ActionProvider, use getJsonRenderState / setJsonRenderState with the
 * registry's handlers factory: handlers(() => setJsonRenderState, () => getJsonRenderState()).
 *
 * Where state is stored: In memory only. The Zustand vanilla store (vanillaStore) holds
 * a single object (Record<string, unknown>) in process memory. It is not persisted to
 * disk or localStorage. Same store instance is shared by ChatPanel and BuilderDashboard.
 */
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { zustandStateStore } from '@json-render/zustand'

export type JsonRenderState = Record<string, unknown>

/** Vanilla store instance. State lives in memory here (not persisted). */
const vanillaStore = createStore<JsonRenderState>(() => ({}))

export const jsonRenderStateStore = zustandStateStore({ store: vanillaStore })

/** Current state (for action handlers' getState). */
export function getJsonRenderState(): JsonRenderState {
  return vanillaStore.getState()
}

/** Update state via updater (for action handlers' setState). */
export function setJsonRenderState(updater: (prev: JsonRenderState) => JsonRenderState): void {
  vanillaStore.setState(updater(vanillaStore.getState()))
}

/**
 * Recursively collect all "$bindState" paths from a spec's elements (props and nested objects).
 */
function collectBindStatePaths(
  value: unknown,
  out: Set<string>
): void {
  if (value == null) return
  if (typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>
    if (typeof o.$bindState === 'string' && o.$bindState) {
      out.add(o.$bindState)
      return
    }
    for (const v of Object.values(o)) collectBindStatePaths(v, out)
  }
}

const INTERACTIVE_TYPES = new Set(['Button', 'Checkbox'])

/**
 * Build an initial state object from $bindState paths (e.g. /contact/name -> { contact: { name: '' } })
 * and add ui: { lastAction, actionLog } when the spec has interactive elements.
 * So the State panel shows all bound paths and action area even when spec.state is missing.
 */
export function inferInitialStateFromBindings(spec: {
  elements?: Record<string, { type?: string; props?: Record<string, unknown> }>
} | null): JsonRenderState {
  const paths = new Set<string>()
  let hasInteractive = false
  if (spec?.elements && typeof spec.elements === 'object') {
    for (const el of Object.values(spec.elements)) {
      if (el?.props) collectBindStatePaths(el.props, paths)
      if (el?.type && INTERACTIVE_TYPES.has(el.type)) hasInteractive = true
    }
  }
  const result: JsonRenderState = {}
  for (const path of paths) {
    const segments = path.split('/').filter(Boolean)
    if (segments.length === 0) continue
    let current: Record<string, unknown> = result
    for (let i = 0; i < segments.length - 1; i++) {
      const key = segments[i]
      if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
        current[key] = {}
      }
      current = current[key] as Record<string, unknown>
    }
    const lastKey = segments[segments.length - 1]
    if (!(lastKey in current)) current[lastKey] = ''
  }
  if (hasInteractive) {
    const buttons: Record<string, boolean> = {}
    if (spec?.elements && typeof spec.elements === 'object') {
      for (const [id, el] of Object.entries(spec.elements)) {
        if (el?.type && INTERACTIVE_TYPES.has(el.type)) buttons[id] = false
      }
    }
    result.ui = {
      ...(result.ui as Record<string, unknown>),
      lastAction: null,
      lastParams: null,
      lastAt: null,
      actionLog: [],
      buttons: { ...(typeof (result.ui as Record<string, unknown>)?.buttons === 'object' ? (result.ui as Record<string, unknown>).buttons as Record<string, boolean> : {}), ...buttons },
    }
  }
  return result
}

/**
 * Set a value at a JSON Pointer path in a copy of the object. Returns the new object.
 */
export function setValueAtPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): Record<string, unknown> {
  const segments = path.split('/').filter(Boolean)
  if (segments.length === 0) return { ...obj }
  const result = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>
  let current: Record<string, unknown> = result
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i]
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }
  current[segments[segments.length - 1]] = value
  return result
}

/**
 * Deep-merge spec.state and inferred $bindState state into the store. Only adds keys that are missing
 * so existing user input is preserved. Call when rendering a spec so the State panel and $bindState work.
 */
export function seedStateFromSpec(spec: { state?: Record<string, unknown>; elements?: Record<string, { props?: Record<string, unknown> }> } | null): void {
  const current = vanillaStore.getState()
  const fromBindings = inferInitialStateFromBindings(spec)
  let merged = deepMergeMissing(current, fromBindings)
  if (spec?.state && typeof spec.state === 'object') {
    merged = deepMergeMissing(merged, spec.state as JsonRenderState)
  }
  if (merged !== current) vanillaStore.setState(merged)
}

function deepMergeMissing(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  let changed = false
  const result = { ...target }
  for (const key of Object.keys(source)) {
    const srcVal = source[key]
    if (!(key in result)) {
      result[key] =
        srcVal != null && typeof srcVal === 'object' && !Array.isArray(srcVal)
          ? deepMergeMissing({}, srcVal as Record<string, unknown>)
          : srcVal
      changed = true
    } else if (
      srcVal != null &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      result[key] != null &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      const nested = deepMergeMissing(
        result[key] as Record<string, unknown>,
        srcVal as Record<string, unknown>
      )
      if (nested !== result[key]) {
        result[key] = nested
        changed = true
      }
    }
  }
  return changed ? result : target
}

/** React hook: current json-render state (re-renders when state changes). Use for debug UI. */
export function useJsonRenderState(): JsonRenderState {
  return useStore(vanillaStore, (s) => s)
}
