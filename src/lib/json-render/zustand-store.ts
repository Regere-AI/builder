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
 * When propKey is provided, collects { path, propKey } so we can infer initial value (e.g. checked -> false).
 */
function collectBindStatePaths(
  value: unknown,
  out: Set<string>,
  pathToProp: Map<string, string>,
  propKey?: string
): void {
  if (value == null) return
  if (typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>
    if (typeof o.$bindState === 'string' && o.$bindState) {
      out.add(o.$bindState)
      if (propKey != null) pathToProp.set(o.$bindState, propKey)
      return
    }
    for (const [k, v] of Object.entries(o)) collectBindStatePaths(v, out, pathToProp, k)
  }
}

const INTERACTIVE_TYPES = new Set(['Button', 'Checkbox'])
const BOOLEAN_BINDING_PROPS = new Set(['checked', 'pressed'])

/**
 * Build an initial state object from $bindState paths (e.g. /contact/name -> { contact: { name: '' } })
 * and add ui: { lastAction, actionLog } when the spec has interactive elements.
 * Paths bound to checked/pressed get false; others get ''.
 */
export function inferInitialStateFromBindings(spec: {
  elements?: Record<string, { type?: string; props?: Record<string, unknown> }>
} | null): JsonRenderState {
  const paths = new Set<string>()
  const pathToProp = new Map<string, string>()
  let hasInteractive = false
  if (spec?.elements && typeof spec.elements === 'object') {
    for (const el of Object.values(spec.elements)) {
      if (el?.props) collectBindStatePaths(el.props, paths, pathToProp)
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
    if (!(lastKey in current)) {
      const prop = pathToProp.get(path)
      current[lastKey] = prop && BOOLEAN_BINDING_PROPS.has(prop) ? false : ''
    }
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
 * Build a fresh state object from a spec (for replacing store when switching to another file).
 * Used so the State panel shows only the state for the currently viewed file.
 */
function buildFreshStateFromSpec(spec: {
  state?: Record<string, unknown>
  elements?: Record<string, { props?: Record<string, unknown> }>
} | null): JsonRenderState {
  if (!spec) return {}
  const fromBindings = inferInitialStateFromBindings(spec)
  if (spec.state && typeof spec.state === 'object') {
    return deepMergeMissing(fromBindings, spec.state as JsonRenderState)
  }
  return fromBindings
}

/** Per-file state cache so switching tabs restores each file's state. */
const stateCacheByFilePath = new Map<string, JsonRenderState>()

/**
 * Switch the store to the state for the given file. Saves current state to the previous file's cache,
 * then loads the new file's state from cache or builds it from the spec. Keeps State panel consistent with the viewed file.
 */
export function switchStateToFile(
  previousPath: string | null,
  newPath: string,
  specForNewFile: { state?: Record<string, unknown>; elements?: Record<string, { props?: Record<string, unknown> }> } | null
): void {
  if (previousPath) {
    stateCacheByFilePath.set(previousPath, vanillaStore.getState())
  }
  const cached = stateCacheByFilePath.get(newPath)
  const nextState = cached ?? buildFreshStateFromSpec(specForNewFile)
  if (cached === undefined && specForNewFile) {
    stateCacheByFilePath.set(newPath, nextState)
  }
  vanillaStore.setState(nextState)
}

/**
 * Deep-merge spec.state and inferred $bindState state into the store. Only adds keys that are missing
 * so existing user input is preserved. Call when rendering a spec (same file) so the State panel and $bindState work.
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
