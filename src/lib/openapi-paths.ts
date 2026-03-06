/** One API operation from an OpenAPI spec (path + method). */
export interface OpenApiOperation {
  method: string
  path: string
  operationId?: string
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

/**
 * Parse OpenAPI 2 or 3 spec and return all path + method combinations.
 * paths: { "/path": { get: {}, post: { operationId: "..." } } }
 */
export function parseOpenApiPaths(spec: unknown): OpenApiOperation[] {
  const result: OpenApiOperation[] = []
  if (!spec || typeof spec !== 'object') return result
  const paths = (spec as Record<string, unknown>).paths
  if (!paths || typeof paths !== 'object') return result
  for (const path of Object.keys(paths)) {
    const pathItem = paths[path]
    if (!pathItem || typeof pathItem !== 'object') continue
    const pathObj = pathItem as Record<string, unknown>
    for (const m of HTTP_METHODS) {
      if (!(m in pathObj)) continue
      const op = pathObj[m]
      const operationId = op && typeof op === 'object' && 'operationId' in (op as object)
        ? (op as Record<string, unknown>).operationId as string
        : undefined
      result.push({
        method: m.toUpperCase(),
        path: path.replace(/\/$/, '') || '/',
        operationId,
      })
    }
  }
  return result
}
