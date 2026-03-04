import { createPortal } from 'react-dom'
import { Globe, Send, Server, Sparkles, X } from 'lucide-react'
import { HTTP_TRIGGER_NODE_TYPE, HTTP_REQUEST_NODE_TYPE, SERVICE_CALL_NODE_TYPE } from './nodes'

export type NodeTypeId = typeof HTTP_TRIGGER_NODE_TYPE | typeof HTTP_REQUEST_NODE_TYPE | typeof SERVICE_CALL_NODE_TYPE

export const ADDABLE_NODE_TYPES: {
  id: NodeTypeId
  label: string
  description: string
  icon: typeof Globe
  accent: string
  iconBg: string
}[] = [
  {
    id: HTTP_TRIGGER_NODE_TYPE,
    label: 'HTTP Trigger',
    description: 'Start your workflow when an HTTP request hits an endpoint',
    icon: Globe,
    accent: 'emerald',
    iconBg: 'bg-emerald-500/20 text-emerald-400',
  },
  {
    id: HTTP_REQUEST_NODE_TYPE,
    label: 'HTTP Request',
    description: 'Make an outbound HTTP request to an API or service',
    icon: Send,
    accent: 'sky',
    iconBg: 'bg-sky-500/20 text-sky-400',
  },
  {
    id: SERVICE_CALL_NODE_TYPE,
    label: 'Service Call',
    description: 'Call an external service or API and use the response',
    icon: Server,
    accent: 'violet',
    iconBg: 'bg-violet-500/20 text-violet-400',
  },
]

interface AddNodeDialogProps {
  open: boolean
  onClose: () => void
  onSelect: (typeId: NodeTypeId) => void
}

export function AddNodeDialog({ open, onClose, onSelect }: AddNodeDialogProps) {
  if (!open) return null

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-node-dialog-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
        aria-hidden
      />
      {/* Modal */}
      <div
        className="relative w-full max-w-lg rounded-xl border border-[#404040] bg-[#252526] p-6 shadow-2xl animate-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="add-node-dialog-title" className="text-lg font-semibold text-[#e0e0e0]">
            Add a node
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 hover:bg-[#3e3e3e] hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-5 text-sm text-gray-400">
          Choose a node type to add to your workflow
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {ADDABLE_NODE_TYPES.map((nodeType) => {
            const Icon = nodeType.icon
            return (
              <button
                key={nodeType.id}
                type="button"
                onClick={() => onSelect(nodeType.id)}
                className={`
                  group flex flex-col items-start gap-2 rounded-lg border-2 border-[#404040]
                  bg-[#2d2d2d] p-4 text-left
                  transition-all duration-200
                  hover:scale-[1.02] hover:border-[#555] hover:shadow-lg hover:shadow-black/20
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50
                `}
              >
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-lg ${nodeType.iconBg} transition-transform group-hover:scale-110`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span className="font-medium text-[#e0e0e0]">{nodeType.label}</span>
                <span className="text-xs leading-snug text-gray-400">
                  {nodeType.description}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-6 rounded-lg border border-dashed border-[#404040] bg-[#1e1e1e]/50 p-4">
          <div className="flex items-center gap-2 text-gray-500">
            <Sparkles className="h-4 w-4 shrink-0" />
            <span className="text-sm">More node types coming soon</span>
          </div>
          <p className="mt-1 text-xs text-gray-600">
            Triggers, conditions, transforms, and more will be available in future updates.
          </p>
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
