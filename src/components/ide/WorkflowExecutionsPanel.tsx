import { useState, useEffect, useCallback, useMemo } from 'react'
import { X, RefreshCw, ChevronDown, ChevronRight, GitBranch, ArrowDown, Copy } from 'lucide-react'
import { Button } from '../ui/button'
import { toast } from 'sonner'
import {
  launchpadWorkflowExecutions,
  type WorkflowExecution,
  type WorkflowExecutionNodeResult,
} from '@/services/api'

/** Workflow graph for execution order (nodes + edges from workflow.data). */
export interface WorkflowDefinition {
  nodes: { id: string }[]
  edges: { source: string; target: string }[]
}

export interface WorkflowExecutionsPanelProps {
  baseUrl: string
  sessionToken: string
  tenant: string
  /** When set, only executions for this workflow are fetched. */
  workflowId?: string | null
  /** When set, steps are ordered by workflow graph and parallel/sequential is shown. */
  workflowDefinition?: WorkflowDefinition | null
  onClose: () => void
}

/** Format ISO date string for display (e.g. "Mar 10, 2026, 5:06 AM"). */
function formatExecutionDate(iso: string | null | undefined): string {
  if (iso == null || iso === '') return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d)
}

/** Compute execution layers: layer 0 = triggers (no incoming), layer k = nodes whose predecessors are in layers 0..k-1. Same layer = can run in parallel. */
function computeExecutionLayers(definition: WorkflowDefinition): string[][] {
  const { nodes, edges } = definition
  const idToNode = new Map(nodes.map((n) => [n.id, n]))
  const predecessors = new Map<string, Set<string>>()
  nodes.forEach((n) => predecessors.set(n.id, new Set()))
  edges.forEach((e) => {
    if (idToNode.has(e.target)) predecessors.get(e.target)?.add(e.source)
  })
  const layers: string[][] = []
  const added = new Set<string>()
  let currentLayer = nodes.filter((n) => predecessors.get(n.id)?.size === 0).map((n) => n.id)
  while (currentLayer.length > 0) {
    layers.push([...currentLayer])
    currentLayer.forEach((id) => added.add(id))
    currentLayer = nodes
      .filter((n) => !added.has(n.id) && (predecessors.get(n.id)?.size ?? 0) > 0)
      .filter((n) => {
        const preds = predecessors.get(n.id) ?? new Set()
        return [...preds].every((p) => added.has(p))
      })
      .map((n) => n.id)
  }
  return layers
}

function hasContent(v: unknown): boolean {
  if (v === undefined || v === null) return false
  if (typeof v === 'string') return v !== ''
  if (typeof v === 'object' && !Array.isArray(v)) return Object.keys(v as object).length > 0
  return true
}

function renderJsonOrString(value: unknown): string {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

/** Build a curl command from request method, url, headers, and body. */
function buildCurlFromRequest(
  method: string,
  url: string,
  headers: Record<string, string> | undefined,
  body: unknown
): string {
  const m = (method || 'GET').toUpperCase()
  const urlStr = url || 'https://example.com/endpoint'
  const lines: string[] = [`curl -X ${m} '${urlStr}'`]
  if (headers && Object.keys(headers).length > 0) {
    for (const [k, v] of Object.entries(headers)) {
      if (k.trim() === '') continue
      const val = (v ?? '').replace(/'/g, "'\\''")
      lines.push(`  -H '${k}: ${val}'`)
    }
  }
  if (hasContent(body)) {
    const raw = typeof body === 'object' ? JSON.stringify(body) : String(body)
    const escaped = raw.replace(/'/g, "'\\''")
    lines.push(`  -d '${escaped}'`)
  }
  return lines.join(' \\\n')
}

function NodeStepRow({
  order,
  nodeId,
  node,
  defaultOpen,
  showOrder = true,
}: {
  order: number
  nodeId: string
  node: WorkflowExecutionNodeResult
  defaultOpen?: boolean
  showOrder?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const requestHeaders = node.request?.headers ?? node.headers
  const requestBody = node.request?.body
  const requestMethod = (node.request as { method?: string } | undefined)?.method ?? (node as WorkflowExecutionNodeResult & { method?: string }).method ?? 'POST'
  const requestUrl = (node.request as { url?: string } | undefined)?.url ?? (node as WorkflowExecutionNodeResult & { url?: string }).url ?? 'https://example.com/endpoint'
  const responseStatus = node.response?.status ?? node.status
  const responseBody = node.response?.body ?? node.body
  const hasRequest = (requestHeaders != null && Object.keys(requestHeaders).length > 0) || hasContent(requestBody)
  const hasResponse = responseStatus !== undefined || hasContent(responseBody)
  const hasDetails = hasRequest || hasResponse

  const handleCopyCurl = useCallback(() => {
    const curl = buildCurlFromRequest(requestMethod, requestUrl, requestHeaders ?? undefined, requestBody)
    navigator.clipboard.writeText(curl).then(
      () => toast.success('Curl copied to clipboard'),
      () => toast.error('Failed to copy')
    )
  }, [requestMethod, requestUrl, requestHeaders, requestBody])

  return (
    <div className="border-l border-[#3e3e3e] pl-2 ml-2">
      <button
        type="button"
        onClick={() => hasDetails && setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-left w-full py-1.5 text-sm text-gray-300 hover:text-gray-100"
      >
        {hasDetails ? (
          open ? (
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {showOrder && <span className="text-gray-500 font-mono text-xs w-5">{order}.</span>}
        <span className="font-medium">{nodeId}</span>
        {responseStatus != null && (
          <span
            className={
              (responseStatus as number) >= 200 && (responseStatus as number) < 300
                ? 'text-emerald-400'
                : (responseStatus as number) >= 400
                  ? 'text-red-400'
                  : 'text-gray-500'
            }
          >
            {responseStatus}
          </span>
        )}
      </button>
      {open && hasDetails && (
        <div className="mt-1 mb-2 space-y-3 text-xs">
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-gray-500 font-medium">Request</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[10px] text-gray-400 hover:text-gray-200"
                onClick={(e) => { e.stopPropagation(); handleCopyCurl() }}
                title="Copy as curl"
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy curl
              </Button>
            </div>
            <div className="mt-0.5 rounded bg-[#252526] p-2 min-h-[2rem]">
              {requestHeaders != null && Object.keys(requestHeaders).length > 0 ? (
                <pre className="overflow-x-auto text-gray-300 whitespace-pre-wrap break-words">
                  {JSON.stringify(requestHeaders, null, 2)}
                </pre>
              ) : null}
              {hasContent(requestBody) ? (
                <pre className="mt-1 overflow-x-auto text-gray-300 whitespace-pre-wrap break-words border-t border-[#3e3e3e] pt-1">
                  {renderJsonOrString(requestBody)}
                </pre>
              ) : null}
              {(requestHeaders == null || Object.keys(requestHeaders).length === 0) && !hasContent(requestBody) && (
                <span className="text-gray-500">—</span>
              )}
            </div>
          </div>
          <div>
            <span className="text-gray-500 font-medium">Response</span>
            <div className="mt-0.5 rounded bg-[#252526] p-2 min-h-[2rem]">
              {responseStatus !== undefined && (
                <p className="text-gray-400">Status: {responseStatus}</p>
              )}
              {hasContent(responseBody) ? (
                <pre className={`overflow-x-auto text-gray-300 whitespace-pre-wrap break-words ${responseStatus !== undefined ? 'mt-1' : ''}`}>
                  {renderJsonOrString(responseBody)}
                </pre>
              ) : null}
              {responseStatus === undefined && !hasContent(responseBody) && (
                <span className="text-gray-500">—</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ExecutionRow({
  execution,
  defaultOpen,
  workflowDefinition,
}: {
  execution: WorkflowExecution
  defaultOpen?: boolean
  workflowDefinition?: WorkflowDefinition | null
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const context = execution.context
  const nodes = context?.nodes ?? {}
  const hasNodes = Object.keys(nodes).length > 0
  const startedAt = execution.started_at ?? execution.startedAt
  const finishedAt = execution.finished_at ?? execution.completedAt
  const displayId = execution.workflow_id ?? execution.workflowId ?? execution.id ?? 'Execution'

  const layers = useMemo(() => {
    if (!workflowDefinition?.nodes?.length) return null
    return computeExecutionLayers(workflowDefinition)
  }, [workflowDefinition])

  const orderedSteps = useMemo(() => {
    if (layers) {
      const ordered: { nodeId: string; node: WorkflowExecutionNodeResult; layerIndex: number; isParallel: boolean }[] = []
      layers.forEach((layer, layerIndex) => {
        const present = layer.filter((id) => nodes[id] != null)
        present.forEach((nodeId) => {
          ordered.push({
            nodeId,
            node: nodes[nodeId],
            layerIndex,
            isParallel: layer.length > 1,
          })
        })
      })
      return ordered
    }
    return Object.entries(nodes).map(([nodeId, node]) => ({
      nodeId,
      node,
      layerIndex: 0,
      isParallel: false,
    }))
  }, [nodes, layers])

  const stepsByLayer = useMemo(() => {
    if (layers) {
      let stepNumber = 0
      return layers
        .map((layer) => {
          const present = layer.filter((id) => nodes[id] != null)
          if (present.length === 0) return null
          stepNumber += 1
          return {
            stepNumber,
            parallel: present.length > 1,
            items: present.map((nodeId) => ({ nodeId, node: nodes[nodeId] })),
          }
        })
        .filter((x): x is NonNullable<typeof x> => x != null)
    }
    return orderedSteps.map((o, i) => ({
      stepNumber: i + 1,
      parallel: false,
      items: [{ nodeId: o.nodeId, node: o.node }],
    }))
  }, [layers, nodes, orderedSteps])

  return (
    <div className="rounded border border-[#3e3e3e] bg-[#252526] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-3 py-2.5 text-left hover:bg-[#2a2d2e] transition-colors"
      >
        {hasNodes || context?.Webhook ? (
          open ? (
            <ChevronDown className="w-4 h-4 shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 shrink-0 text-gray-400" />
          )
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span className="text-sm font-medium text-gray-200 truncate" title={String(displayId)}>
          {displayId}
        </span>
        {execution.status != null && (
          <span
            className={
              execution.status === 'completed' || execution.status === 'success'
                ? 'text-emerald-400 text-xs shrink-0'
                : execution.status === 'failed' || execution.status === 'error'
                  ? 'text-red-400 text-xs shrink-0'
                  : 'text-gray-500 text-xs shrink-0'
            }
          >
            {execution.status}
          </span>
        )}
        {startedAt != null && (
          <span className="ml-auto text-xs text-gray-500 shrink-0" title={startedAt}>
            {formatExecutionDate(startedAt)}
          </span>
        )}
      </button>
      {open && (
        <div className="border-t border-[#3e3e3e] px-3 py-2 space-y-2">
          {startedAt != null && (
            <p className="text-xs text-gray-500">
              Started: {formatExecutionDate(startedAt)}
              {finishedAt != null && ` · Finished: ${formatExecutionDate(finishedAt)}`}
            </p>
          )}
          {context?.Webhook != null && (
            <div className="rounded bg-[#1e1e1e] p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-gray-500">Webhook (trigger)</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[10px] text-gray-400 hover:text-gray-200"
                  onClick={() => {
                    const curl = buildCurlFromRequest(
                      'POST',
                      'https://example.com/webhook',
                      context.Webhook?.headers,
                      context.Webhook?.body
                    )
                    navigator.clipboard.writeText(curl).then(
                      () => toast.success('Curl copied to clipboard'),
                      () => toast.error('Failed to copy')
                    )
                  }}
                  title="Copy as curl"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy curl
                </Button>
              </div>
              {context.Webhook.headers != null && Object.keys(context.Webhook.headers).length > 0 && (
                <pre className="mt-1 text-xs rounded bg-[#252526] p-2 overflow-x-auto text-gray-300">
                  {JSON.stringify(context.Webhook.headers, null, 2)}
                </pre>
              )}
              {context.Webhook.body !== undefined && Object.keys(context.Webhook.body as object).length > 0 && (
                <pre className="mt-1 text-xs rounded bg-[#252526] p-2 overflow-x-auto text-gray-300">
                  {JSON.stringify(context.Webhook.body, null, 2)}
                </pre>
              )}
            </div>
          )}
          {hasNodes ? (
            <div>
              <span className="text-xs font-medium text-gray-500">
                {layers ? 'Steps (workflow order)' : 'Steps'}
              </span>
              <div className="mt-1 space-y-0">
                {stepsByLayer.map((group) =>
                  group.parallel ? (
                    <div key={group.stepNumber} className="border-l border-amber-500/50 pl-2 ml-2 my-1">
                      <div className="flex items-center gap-1.5 py-1 text-xs text-amber-400/90">
                        <GitBranch className="w-3.5 h-3.5" />
                        <span className="font-medium">Step {group.stepNumber} — Parallel</span>
                      </div>
                      <div className="space-y-0 pl-1">
                        {group.items.map(({ nodeId, node }, i) => (
                          <NodeStepRow
                            key={nodeId}
                            order={0}
                            nodeId={nodeId}
                            node={node}
                            defaultOpen={i === 0}
                            showOrder={false}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="border-l border-[#3e3e3e] pl-2 ml-2">
                      {layers && (
                        <div className="flex items-center gap-1.5 py-0.5 text-xs text-gray-500">
                          <ArrowDown className="w-3.5 h-3.5" />
                          <span>Step {group.stepNumber} — Sequential</span>
                        </div>
                      )}
                      {group.items.map(({ nodeId, node }) => (
                        <NodeStepRow
                          key={nodeId}
                          order={group.stepNumber}
                          nodeId={nodeId}
                          node={node}
                          defaultOpen={group.stepNumber === 1}
                          showOrder={true}
                        />
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500">No step details</p>
          )}
        </div>
      )}
    </div>
  )
}

export function WorkflowExecutionsPanel({ baseUrl, sessionToken, tenant, workflowId, workflowDefinition, onClose }: WorkflowExecutionsPanelProps) {
  const [executions, setExecutions] = useState<WorkflowExecution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await launchpadWorkflowExecutions(baseUrl, {
        sessionToken,
        tenant,
        workflowId: workflowId ?? undefined,
      })
      setExecutions(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [baseUrl, sessionToken, tenant, workflowId])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] max-w-[100vw] bg-[#1e1e1e] border-l border-[#3e3e3e] flex flex-col z-50 shadow-xl">
      <div className="h-12 px-3 flex items-center justify-between border-b border-[#3e3e3e] shrink-0">
        <h2 className="text-sm font-medium text-gray-200">Workflow executions</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-gray-200"
            onClick={load}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-gray-200"
            onClick={onClose}
            title="Close"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3">
        {error && (
          <div className="mb-3 p-2 rounded bg-red-900/20 border border-red-500/30 text-red-300 text-sm">
            {error}
          </div>
        )}
        {loading && executions.length === 0 ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : executions.length === 0 ? (
          <p className="text-sm text-gray-500">No executions yet.</p>
        ) : (
          <div className="space-y-2">
            {executions.map((ex, i) => (
              <ExecutionRow
                key={ex.id ?? i}
                execution={ex}
                defaultOpen={i === 0}
                workflowDefinition={workflowDefinition}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
