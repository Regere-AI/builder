/**
 * Component manifest and registry.
 *
 * GUARANTEE (render-only-real, no fallbacks):
 * 1. Every entry in component-manifest.json is in REGISTERED_COMPONENT_NAMES and getAvailableComponentNames().
 * 2. Prompts use getAvailableComponentNames() (manifest). For best UX, use only components the host exports (see frontend RESOLVED_COMPONENT_NAMES).
 * 3. json-validator-strict and post-processor never convert a component that isRegisteredComponent() (i.e. in manifest).
 * 4. Frontend ComponentRegistry has an entry only for components that the component host actually exports (no fallback placeholders).
 * 5. UIRenderer.createSafeRegistry passes through only valid components (no filling with fallbacks).
 * 6. LayoutRenderer renders a node only when the component exists in the registry; otherwise it renders null (no fallback UI).
 * Result: Only host-resolved components render; manifest names not exported by the host render as nothing.
 */

import manifest from "./component-manifest.json";

export const COMPONENT_MANIFEST = manifest;

export type ComponentName = keyof typeof manifest;

/** All component names from the manifest; single source of truth for "registered" and "available" components */
export const REGISTERED_COMPONENT_NAMES =
  Object.keys(manifest) as ComponentName[];

/** Sorted list of all available component names (same as manifest). Use this for "AVAILABLE COMPONENTS" in prompts. */
export function getAvailableComponentNames(): ComponentName[] {
  return [...REGISTERED_COMPONENT_NAMES].sort();
}

const manifestKeys = Object.keys(manifest);

/** Verify that REGISTERED_COMPONENT_NAMES exactly matches the manifest (no drift). Call at startup in dev. */
export function verifyManifestConsistency(): void {
  if (manifestKeys.length !== REGISTERED_COMPONENT_NAMES.length) {
    throw new Error(
      `[componentNames] Manifest consistency failed: manifest has ${manifestKeys.length} keys but REGISTERED_COMPONENT_NAMES has ${REGISTERED_COMPONENT_NAMES.length}`
    );
  }
  const set = new Set(REGISTERED_COMPONENT_NAMES);
  for (const key of manifestKeys) {
    if (!set.has(key as ComponentName)) {
      throw new Error(`[componentNames] Manifest key "${key}" missing from REGISTERED_COMPONENT_NAMES`);
    }
  }
}

/**
 * Verify that a registry has an entry for every manifest component (so all manifest components can render).
 * Use in frontend after building the registry; throws if any manifest component is missing.
 */
export function verifyRegistryHasAllManifestComponents(
  registry: Record<string, unknown>,
  label = "Registry"
): void {
  const missing: string[] = [];
  for (const name of REGISTERED_COMPONENT_NAMES) {
    const entry = registry[name];
    if (entry == null || (typeof entry !== "function" && typeof entry !== "object")) {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `[${label}] Missing entries for manifest components: ${missing.slice(0, 15).join(", ")}${missing.length > 15 ? ` and ${missing.length - 15} more` : ""}. Every component in component-manifest.json must have a registry entry.`
    );
  }
}

/** Components that need minWidth, minHeight, aria-label (from manifest.interactive) */
export const INTERACTIVE_COMPONENT_NAMES: ComponentName[] = (
  REGISTERED_COMPONENT_NAMES as ComponentName[]
).filter(
  (name) =>
    (manifest as Record<string, { interactive?: boolean }>)[name]?.interactive ===
    true
);

/** True if the component is in the manifest (should be rendered, not converted to Label) */
export function isRegisteredComponent(name: string): boolean {
  return REGISTERED_COMPONENT_NAMES.includes(name as ComponentName);
}

/** True if the component should get accessibility props (minWidth, minHeight, aria-label) */
export function isInteractiveComponent(name: string): boolean {
  return INTERACTIVE_COMPONENT_NAMES.includes(name as ComponentName);
}

/** Components that accept options as componentProps.options (from manifest.acceptsOptions) */
export const COMPONENTS_ACCEPTING_OPTIONS: ComponentName[] = (
  REGISTERED_COMPONENT_NAMES as ComponentName[]
).filter(
  (name) =>
    (manifest as Record<string, { acceptsOptions?: boolean }>)[name]?.acceptsOptions === true
);

/** True if the component accepts options (embed in componentProps.options; do not use sibling nodes) */
export function componentAcceptsOptions(name: string): boolean {
  return COMPONENTS_ACCEPTING_OPTIONS.includes(name as ComponentName);
}

/** Data capability: multi-series = charts with data array; single-value = e.g. Progress (0-100) */
export type AcceptsDataCapability = "multi-series" | "single-value";

/** Registry entry for structure validation and auto-fix (optional fields; defaults applied when missing) */
export interface ComponentMeta {
  acceptsOptions?: boolean;
  acceptsChildren?: boolean;
  requiredProps?: string[];
  forbiddenProps?: string[];
  structure?: "leaf" | "layout" | "container";
  interactive?: boolean;
  props?: string[];
  /** Data shape: multi-series (PieChart, BarChart, etc.) vs single-value (Progress) */
  acceptsData?: AcceptsDataCapability;
  /** Human-readable schema hint, e.g. "array<{ name: string; value: number }>" or "number (0-100)" */
  dataSchema?: string;
}

const manifestRecord = manifest as Record<string, ComponentMeta>;

/** Get component metadata from registry. Defaults: acceptsChildren true, no required/forbidden props. */
export function getComponentMeta(name: string): ComponentMeta | null {
  if (!name || !isRegisteredComponent(name)) return null;
  return manifestRecord[name] ?? null;
}

/** True if the component must not have child nodes (registry says acceptsChildren: false) */
export function componentRejectsChildren(name: string): boolean {
  const meta = getComponentMeta(name);
  return meta?.acceptsChildren === false;
}

/** Components that accept multi-series data (charts: PieChart, BarChart, etc.) */
export const COMPONENTS_ACCEPTING_MULTI_SERIES: ComponentName[] = (
  REGISTERED_COMPONENT_NAMES as ComponentName[]
).filter(
  (name) =>
    (manifest as Record<string, { acceptsData?: string }>)[name]?.acceptsData === "multi-series"
);

/** Components that accept single numeric value (e.g. Progress 0-100) */
export const COMPONENTS_ACCEPTING_SINGLE_VALUE: ComponentName[] = (
  REGISTERED_COMPONENT_NAMES as ComponentName[]
).filter(
  (name) =>
    (manifest as Record<string, { acceptsData?: string }>)[name]?.acceptsData === "single-value"
);

/** Get data capability for prompt/validation: multiSeries and singleValue component lists */
export function getDataCapabilityComponents(): {
  multiSeries: string[];
  singleValue: string[];
} {
  return {
    multiSeries: [...COMPONENTS_ACCEPTING_MULTI_SERIES],
    singleValue: [...COMPONENTS_ACCEPTING_SINGLE_VALUE],
  };
}