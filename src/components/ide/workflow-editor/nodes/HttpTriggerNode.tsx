import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Globe, Lock } from 'lucide-react'

export const HTTP_TRIGGER_NODE_TYPE = 'httpTrigger'

export type HttpTriggerNodeData = {
  label?: string
  method?: string
  path?: string
  authentication?: 'none' | 'bearer'
  /** Raw request body as JSON string (for POST, PUT, PATCH). */
  rawBody?: string
}

/** Default HTTP Trigger node: one connection point only (source on the right) to connect to other nodes. */
export const defaultHttpTriggerNode: {
  type: typeof HTTP_TRIGGER_NODE_TYPE
  data: HttpTriggerNodeData
  sourcePosition: (typeof Position)['Right']
} = {
  type: HTTP_TRIGGER_NODE_TYPE,
  data: { method: 'POST', path: '/webhook' },
  sourcePosition: Position.Right,
}

export function HttpTriggerNode(props: NodeProps) {
  const { selected, id } = props
  const data = (props.data ?? {}) as HttpTriggerNodeData
  const isProtected = data?.authentication && data.authentication !== 'none'
  return (
    <div
      className={`
        min-w-[180px] rounded-lg border-2 px-4 py-3 shadow-md
        bg-[#2d2d2d] text-[#e0e0e0]
        border-emerald-600/70
        ${selected ? 'ring-2 ring-emerald-500/60 ring-offset-2 ring-offset-[#1e1e1e]' : ''}
      `}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-emerald-600/30 text-emerald-400">
          <Globe className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm">HTTP Trigger</div>
          {(data?.method ?? data?.path) && (
            <div className="truncate text-xs text-gray-400">
              {[data?.method, data?.path].filter(Boolean).join(' ')}
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-1 text-[10px]" title={isProtected ? 'Authentication required' : 'Public endpoint'}>
            {isProtected ? (
              <>
                <Lock className="h-3 w-3 shrink-0 text-amber-400/90" />
                <span className="text-amber-400/90">Requires auth</span>
              </>
            ) : (
              <span className="text-gray-500">Public API</span>
            )}
          </div>
          <div className="mt-1 truncate font-mono text-[10px] text-gray-600" title={id}>
            {id}
          </div>
        </div>
      </div>
      {/* Single connection point: source on the right only (no target – entry node) */}
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-[#2d2d2d]" />
    </div>
  )
}
