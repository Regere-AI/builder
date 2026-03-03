/**
 * Zustand-backed StateStore for json-render (controlled mode).
 * Use this store with <StateProvider store={jsonRenderStateStore}> or
 * <JSONUIProvider store={jsonRenderStateStore} ... />.
 */
import { createStore } from 'zustand/vanilla'
import { zustandStateStore } from '@json-render/zustand'

const vanillaStore = createStore<Record<string, unknown>>(() => ({}))

export const jsonRenderStateStore = zustandStateStore({ store: vanillaStore })
