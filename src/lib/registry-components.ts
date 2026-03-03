/**
 * Fetch and parse component definitions from an npm package.
 * Looks for component-definitions.json or component-definitions.js (or .ts) in the package.
 */

export interface ComponentDefinition {
  name: string
  description?: string
  /** Raw schema/props snippet (zod or JSON) for "More details" */
  schemaSnippet?: string
}

const UNPKG_BASE = 'https://unpkg.com'
const JSDELIVR_BASE = 'https://cdn.jsdelivr.net/npm'

/** In-memory cache: package name -> component definitions (persists for session). */
const componentDefinitionsCache = new Map<string, ComponentDefinition[]>()

function packagePath(pkg: string): string {
  return pkg.trim().replace(/^npm:\s*/i, '')
}

function tryFetch(url: string): Promise<Response> {
  return fetch(url, { mode: 'cors', cache: 'default' })
}

/** Path prefixes to look for component-definitions (root and dist/). */
const DEFINITIONS_PATH_PREFIXES = ['', 'dist/']

const DEFINITIONS_FILES = ['component-definitions.json', 'component-definitions.js', 'component-definitions.ts']

/**
 * Try to load component-definitions from a package via CDN.
 * Results are cached in memory for the session; repeated calls for the same package return the cache.
 * Tries root and dist/: component-definitions.json, .js, .ts,
 * then falls back to the package main entry (e.g. index.js) and parses for definitions.
 */
export async function fetchComponentDefinitions(pkg: string): Promise<ComponentDefinition[]> {
  const name = packagePath(pkg)
  if (!name) return []

  const cached = componentDefinitionsCache.get(name)
  if (cached !== undefined) return cached

  const bases = [
    `${UNPKG_BASE}/${name}@latest`,
    `${JSDELIVR_BASE}/${name}@latest`,
  ]

  for (const base of bases) {
    for (const prefix of DEFINITIONS_PATH_PREFIXES) {
      for (const file of DEFINITIONS_FILES) {
        const path = prefix ? `${prefix}${file}` : file
        try {
          const res = await tryFetch(`${base}/${path}`)
          if (!res.ok) continue
          const text = await res.text()
          if (file.endsWith('.json')) {
            const parsed = parseJsonDefinitions(text)
            if (parsed.length > 0) {
              componentDefinitionsCache.set(name, parsed)
              return parsed
            }
          } else {
            const parsed = parseJsDefinitions(text)
            if (parsed.length > 0) {
              componentDefinitionsCache.set(name, parsed)
              return parsed
            }
          }
        } catch {
          continue
        }
      }
    }
  }

  // Fallback: fetch package main entry and parse for component definitions
  for (const base of bases) {
    try {
      const pkgJsonRes = await tryFetch(`${base}/package.json`)
      if (!pkgJsonRes.ok) continue
      const pkgJson = (await pkgJsonRes.json()) as { main?: string; module?: string; exports?: Record<string, unknown> }
      const mainPath = resolveMainPath(pkgJson)
      if (!mainPath) continue
      const mainRes = await tryFetch(`${base}/${mainPath}`)
      if (!mainRes.ok) continue
      const text = await mainRes.text()
      const parsed = parseJsDefinitions(text)
      if (parsed.length > 0) {
        componentDefinitionsCache.set(name, parsed)
        return parsed
      }
    } catch {
      continue
    }
  }

  componentDefinitionsCache.set(name, [])
  return []
}

function resolveMainPath(pkg: { main?: string; module?: string; exports?: Record<string, unknown> }): string | null {
  if (pkg.main && typeof pkg.main === 'string') return pkg.main
  if (pkg.module && typeof pkg.module === 'string') return pkg.module
  const exp = pkg.exports
  if (exp && typeof exp === 'object') {
    const def = (exp as Record<string, string>)['.']
    if (typeof def === 'string') return def
    if (def && typeof def === 'object' && 'import' in def) return (def as { import: string }).import
    if (def && typeof def === 'object' && 'default' in def) return (def as { default: string }).default
  }
  return null
}

/** Parse a JSON file: expects { components: { Name: { description?, props? } } } or { Name: { ... } } */
function parseJsonDefinitions(text: string): ComponentDefinition[] {
  try {
    const data = JSON.parse(text) as Record<string, unknown>
    const components = (data.components as Record<string, Record<string, unknown>>) ?? data
    const out: ComponentDefinition[] = []
    for (const [key, value] of Object.entries(components)) {
      if (value && typeof value === 'object' && key[0] === key[0].toUpperCase()) {
        const v = value as { description?: string }
        const desc = v.description
        const schemaSnippet = JSON.stringify(value, null, 2)
        out.push({
          name: key,
          description: typeof desc === 'string' ? desc : undefined,
          schemaSnippet: schemaSnippet.length > 20 ? schemaSnippet : undefined,
        })
      }
    }
    return out
  } catch {
    return []
  }
}

/**
 * Parse a JS/TS module file: find PascalCase (or quoted) keys, description, and full block for schema.
 */
function parseJsDefinitions(text: string): ComponentDefinition[] {
  const out: ComponentDefinition[] = []
  const blockRegex = /(?:["']?([A-Z][a-zA-Z0-9]*)["']?\s*:\s*\{)/g
  const descRegex = /description\s*:\s*['"]([^'"]*)['"]/g

  let match: RegExpExecArray | null
  const blocks: { index: number; name: string }[] = []
  while ((match = blockRegex.exec(text)) !== null) {
    if (match[1]) blocks.push({ index: match.index, name: match[1] })
  }

  for (let i = 0; i < blocks.length; i++) {
    const start = blocks[i].index
    const end = i + 1 < blocks.length ? blocks[i + 1].index : text.length
    const rawBlock = text.slice(start, end)
    descRegex.lastIndex = 0
    const descMatch = descRegex.exec(rawBlock)
    const description = descMatch ? descMatch[1] : undefined
    const schemaSnippet = formatBlockSnippet(rawBlock)
    out.push({
      name: blocks[i].name,
      description: description ?? undefined,
      schemaSnippet: schemaSnippet.length > 10 ? schemaSnippet : undefined,
    })
  }

  return out
}

/** Trim and normalize a block snippet for display (indent, max length). */
function formatBlockSnippet(block: string): string {
  const trimmed = block.trim()
  const maxLen = 4000
  const snippet = trimmed.length > maxLen ? trimmed.slice(0, maxLen) + '\n  // … truncated' : trimmed
  return snippet
}
