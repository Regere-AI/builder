import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Send } from 'lucide-react'

export const HTTP_REQUEST_NODE_TYPE = 'httpRequest'

export type HttpRequestNodeData = {
  url?: string
  method?: string
  header?: Record<string, string>
  payload?: string
}

const defaultData: HttpRequestNodeData = {
  url: '',
  method: 'GET',
  header: {},
  payload: '',
}

export const defaultHttpRequestNodeData = defaultData

export function HttpRequestNode(props: NodeProps) {
  const { selected } = props
  const d = (props.data ?? defaultData) as HttpRequestNodeData
  return (
    <div
      className={`
        min-w-[200px] max-w-[240px] rounded-lg border-2 px-4 py-3 shadow-md
        bg-[#2d2d2d] text-[#e0e0e0]
        border-sky-600/60 overflow-visible
        ${selected ? 'ring-2 ring-sky-500/60 ring-offset-2 ring-offset-[#1e1e1e]' : ''}
      `}
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-sky-600/30 text-sky-400">
          <Send className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 overflow-visible">
          <div className="font-medium text-sm truncate">HTTP Request</div>
          {(d?.method ?? d?.url) && (
            <div className="group/url relative">
              <div className="truncate text-xs text-gray-400">
                {[d?.method, d?.url].filter(Boolean).join(' ')}
              </div>
              <div
                className="absolute bottom-full left-0 z-50 mb-1 max-w-[320px] break-words rounded border border-[#3e3e3e] bg-[#252526] px-2 py-1.5 text-xs text-gray-200 shadow-lg opacity-0 pointer-events-none group-hover/url:opacity-100"
                role="tooltip"
              >
                {[d?.method, d?.url].filter(Boolean).join(' ')}
              </div>
            </div>
          )}
          <div className="mt-1 group/id relative">
            <div className="truncate font-mono text-[10px] text-gray-600">{props.id}</div>
            <div
              className="absolute bottom-full left-0 z-50 mb-1 max-w-[320px] break-words rounded border border-[#3e3e3e] bg-[#252526] px-2 py-1.5 font-mono text-[10px] text-gray-200 shadow-lg opacity-0 pointer-events-none group-hover/id:opacity-100"
              role="tooltip"
            >
              {props.id}
            </div>
          </div>
        </div>
      </div>
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-sky-500 !border-2 !border-[#2d2d2d]" />
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-sky-500 !border-2 !border-[#2d2d2d]" />
    </div>
  )
}
