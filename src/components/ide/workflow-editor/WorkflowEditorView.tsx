import { useMemo, useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  type BackgroundVariant,
  type Connection,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { workflowNodeTypes, SERVICE_CALL_NODE_TYPE, defaultHttpTriggerNode } from './nodes'
import { AddNodeToolbar } from './AddNodeToolbar'

export interface WorkflowEditorViewProps {
  /** Raw workflow JSON string from the .workflow.json file */
  json: string
  /** Called when flow data (nodes/edges) changes; receives full workflow JSON with data: { nodes, edges } */
  onChange?: (json: string) => void
}

const DEFAULT_NODES: Node[] = [
  {
    id: 'trigger-1',
    position: { x: 80, y: 100 },
    ...defaultHttpTriggerNode,
  } as Node,
  {
    id: 'service-1',
    position: { x: 380, y: 100 },
    type: SERVICE_CALL_NODE_TYPE,
    data: { serviceName: 'My Service', operation: 'run' },
  },
]

const DEFAULT_EDGES: Edge[] = [
  { id: 'trigger-1-service-1', source: 'trigger-1', target: 'service-1', type: 'step' },
]

function parseWorkflowData(json: string): { workflow: Record<string, unknown>; nodes: Node[]; edges: Edge[] } {
  try {
    const workflow = JSON.parse(json) as Record<string, unknown>
    const data = (workflow.data as Record<string, unknown> | undefined) ?? {}
    const nodes = Array.isArray(data.nodes) && data.nodes.length > 0 ? (data.nodes as Node[]) : DEFAULT_NODES
    const edges = Array.isArray(data.edges) ? (data.edges as Edge[]) : DEFAULT_EDGES
    return { workflow, nodes, edges }
  } catch {
    return { workflow: {}, nodes: DEFAULT_NODES, edges: DEFAULT_EDGES }
  }
}

export function WorkflowEditorView({ json, onChange }: WorkflowEditorViewProps) {
  const parsed = useMemo(() => parseWorkflowData(json), [json])
  const [nodes, setNodes, onNodesChange] = useNodesState(parsed.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(parsed.edges)
  const isFirstMount = useRef(true)
  const lastUpdateFromJsonSync = useRef(false)

  useEffect(() => {
    lastUpdateFromJsonSync.current = true
    setNodes(parsed.nodes)
    setEdges(parsed.edges)
  }, [json])

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false
      return
    }
    if (lastUpdateFromJsonSync.current) {
      lastUpdateFromJsonSync.current = false
      return
    }
    if (!onChange) return
    try {
      const workflow = JSON.parse(json) as Record<string, unknown>
      workflow.data = { ...(workflow.data as Record<string, unknown> | undefined), nodes, edges }
      const nextStr = JSON.stringify(workflow, null, 2)
      if (nextStr !== json) onChange(nextStr)
    } catch {
      const nextStr = JSON.stringify({ data: { nodes, edges } }, null, 2)
      if (nextStr !== json) onChange(nextStr)
    }
  }, [nodes, edges, onChange, json])

  const onConnect = (connection: Connection) => {
    setEdges((prev) => addEdge(connection, prev))
  }

  return (
    <div className="workflow-editor-canvas flex-1 w-full h-full min-h-0">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={workflowNodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        colorMode="dark"
        className="bg-[var(--editor-bg)]"
      >
        <Background variant={'dots' as BackgroundVariant} gap={16} size={1} />
        <Controls />
        <AddNodeToolbar setNodes={setNodes} />
      </ReactFlow>
    </div>
  )
}
