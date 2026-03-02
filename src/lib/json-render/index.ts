/**
 * json-render integration for Builder.
 *
 * - catalog: component and action definitions for AI (catalog.prompt() for system prompt).
 * - registry: React component registry for <Renderer spec={spec} registry={registry} />.
 * - layout-to-spec: convert legacy LayoutNode JSON to flat Spec for the React renderer.
 *
 * For external state management (e.g. Redux), use @json-render/redux to create a store
 * and pass it to StateProvider: <StateProvider store={reduxStore}>.
 * See: https://json-render.dev/docs/data-binding#external-store-controlled-mode
 */

export { catalog, type Catalog } from './catalog'
export { registry } from './registry'
export {
  layoutNodeToSpec,
  isJsonRenderSpec,
  parseToSpec,
  type LayoutNode,
  type JsonRenderSpec,
} from './layout-to-spec'
