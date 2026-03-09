import { useState } from 'react'
import { Panel, useReactFlow } from '@xyflow/react'
import { Plus } from 'lucide-react'
import type { Node } from '@xyflow/react'
import { AddNodeDialog, type NodeTypeId } from './AddNodeDialog'
import {
  HTTP_TRIGGER_NODE_TYPE,
  HTTP_REQUEST_NODE_TYPE,
  SERVICE_CALL_NODE_TYPE,
  defaultHttpTriggerNode,
  defaultHttpRequestNodeData,
} from './nodes'

interface AddNodeToolbarProps {
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>
}

function generateNodeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toLowerCase()
}

export function AddNodeToolbar({ setNodes }: AddNodeToolbarProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const { screenToFlowPosition } = useReactFlow()

  const handleSelect = (typeId: NodeTypeId) => {
    const centerX = typeof window !== 'undefined' ? window.innerWidth / 2 : 400
    const centerY = typeof window !== 'undefined' ? window.innerHeight / 2 : 300
    const position = screenToFlowPosition({ x: centerX, y: centerY })

    if (typeId === HTTP_TRIGGER_NODE_TYPE) {
      const newNode: Node = {
        id: generateNodeId('trigger'),
        position,
        type: HTTP_TRIGGER_NODE_TYPE,
        data: defaultHttpTriggerNode.data,
        sourcePosition: defaultHttpTriggerNode.sourcePosition,
      }
      setNodes((prev) => [...prev, newNode])
    } else if (typeId === HTTP_REQUEST_NODE_TYPE) {
      const newNode: Node = {
        id: generateNodeId('http-request'),
        position,
        type: HTTP_REQUEST_NODE_TYPE,
        data: defaultHttpRequestNodeData,
      }
      setNodes((prev) => [...prev, newNode])
    } else if (typeId === SERVICE_CALL_NODE_TYPE) {
      const newNode: Node = {
        id: generateNodeId('service'),
        position,
        type: SERVICE_CALL_NODE_TYPE,
        data: { serviceName: 'My Service', operation: 'run' },
      }
      setNodes((prev) => [...prev, newNode])
    }

    setDialogOpen(false)
  }

  return (
    <>
      <Panel position="top-center" className="m-2">
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="
            flex items-center gap-2 rounded-lg border border-[#404040] bg-[#2d2d2d]
            px-4 py-2.5 text-sm font-medium text-[#e0e0e0]
            shadow-lg
            transition-all hover:scale-105 hover:border-emerald-500/50 hover:bg-[#3e3e3e] hover:shadow-emerald-500/10
            focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50
          "
        >
          <Plus className="h-4 w-4" />
          Add node
        </button>
      </Panel>
      <AddNodeDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSelect={handleSelect}
      />
    </>
  )
}
