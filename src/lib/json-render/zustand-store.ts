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

/** React hook: current json-render state (re-renders when state changes). Use for debug UI. */
export function useJsonRenderState(): JsonRenderState {
  return useStore(vanillaStore, (s) => s)
}
