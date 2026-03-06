import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Server, Lock } from 'lucide-react'

export const SERVICE_CALL_NODE_TYPE = 'serviceCall'

export type ServiceCallNodeData = {
  label?: string
  serviceName?: string
  /** Launchpad service slug (for spec fetch and display). */
  serviceSlug?: string
  operation?: string
  method?: string
  path?: string
  authentication?: 'none' | 'bearer'
  rawBody?: string
}

export function ServiceCallNode(props: NodeProps<ServiceCallNodeData>) {
  const { data, selected, id } = props
  const nodeData = data ?? {}
  const isProtected = nodeData?.authentication && nodeData.authentication !== 'none'
  return (
    <div
      className={`
        min-w-[200px] rounded-lg border-2 px-4 py-3 shadow-md
        bg-[#2d2d2d] text-[#e0e0e0]
        border-violet-600/60
        ${selected ? 'ring-2 ring-violet-500/60 ring-offset-2 ring-offset-[#1e1e1e]' : ''}
      `}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-violet-600/30 text-violet-400">
          <Server className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm">Service Call</div>
          {(nodeData?.method ?? nodeData?.path ?? nodeData?.serviceName) && (
            <div className="truncate text-xs text-gray-400">
              {[nodeData?.method, nodeData?.path].filter(Boolean).join(' ') ||
                (nodeData?.serviceName && (nodeData?.operation ? `${nodeData.serviceName} · ${nodeData.operation}` : nodeData.serviceName))}
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
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-violet-500 !border-2 !border-[#2d2d2d]" />
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-violet-500 !border-2 !border-[#2d2d2d]" />
    </div>
  )
}
