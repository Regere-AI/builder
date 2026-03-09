/**
 * json-render integration for Builder.
 *
 * - catalog: component and action definitions for AI (catalog.prompt() for system prompt).
 * - registry: React component registry for <Renderer spec={spec} registry={registry} />.
 * - layout-to-spec: convert legacy LayoutNode JSON to flat Spec for the React renderer.
 * - streaming: SpecStream (RFC 6902 JSON Patch: add, remove, replace, move, copy, test); createSpecStreamCompiler, compileSpecStream.
 * - zustand-store: Zustand-backed StateStore used with StateProvider / JSONUIProvider (controlled mode).
 *
 * StateStore (Zustand): We use @json-render/zustand to back json-render state with a Zustand
 * vanilla store. Pass the store to StateProvider or JSONUIProvider: <StateProvider store={store}>.
 * See: https://json-render.dev/docs/data-binding#external-store-controlled-mode
 *
 * Summary — StateStore, state, and actions with Zustand:
 * - StateStore: The interface json-render uses to read/write state (get, set, subscribe). The
 *   Zustand adapter (zustandStateStore) wraps a zustand/vanilla store so it implements that
 *   interface; we pass it to StateProvider/JSONUIProvider as the single source of truth.
 * - State: The JSON tree of data (e.g. { user: { name: "Alice" }, form: {} }) that the UI
 *   reads from via expressions like { "$state": "/user/name" } and that actions or bindings update.
 * - Action: Named handlers (e.g. submit_form, navigate) implemented in the registry; they
 *   receive (params, setState, state). Updates go through the store (Zustand), so the same
 *   StateStore is used whether state is updated by bindings or by action handlers.
 *
 * Dynamic data binding (all components, including dynamically added ones):
 * - Catalog uses strProp, boolProp, valueProp for props that accept expressions. Specs can use
 *   $state, $template, $cond, $item, $index in any such prop; form controls use $bindState/$bindItem
 *   for two-way binding. See https://json-render.dev/docs/data-binding
 * - When adding new components: (1) Use strProp/boolProp/valueProp in catalog for bindable props.
 *   (2) In the registry, for form controls (value, checked, pressed), use useBoundProp(prop, bindings?.propName)
 *   and write back via setValue so two-way binding works. (3) seedStateFromSpec + inferInitialStateFromBindings
 *   will seed state for $bindState paths (boolean for checked/pressed, string otherwise).
 *
 * Streaming: https://json-render.dev/docs/streaming
 * React API: https://json-render.dev/docs/api/react
 */

export {
  catalog,
  type Catalog,
  strProp,
  strPropRequired,
  boolProp,
  valueProp,
} from './catalog'
export { registry, handlers, jsonRenderActionHandlers } from './registry'
export {
  createSpecStreamCompiler,
  compileSpecStream,
} from './streaming'
export {
  layoutNodeToSpec,
  isJsonRenderSpec,
  parseToSpec,
  attachOrphanElementsToRoot,
  injectDefaultActions,
  type LayoutNode,
  type JsonRenderSpec,
} from './layout-to-spec'
export { jsonRenderStateStore, useJsonRenderState } from './zustand-store'
