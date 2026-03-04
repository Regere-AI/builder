import type { NodeTypes } from '@xyflow/react'
import { HttpTriggerNode, HTTP_TRIGGER_NODE_TYPE } from './HttpTriggerNode'
import { ServiceCallNode, SERVICE_CALL_NODE_TYPE } from './ServiceCallNode'

export { HttpTriggerNode, HTTP_TRIGGER_NODE_TYPE, defaultHttpTriggerNode } from './HttpTriggerNode'
export type { HttpTriggerNodeData } from './HttpTriggerNode'
export { ServiceCallNode, SERVICE_CALL_NODE_TYPE } from './ServiceCallNode'
export type { ServiceCallNodeData } from './ServiceCallNode'

export const workflowNodeTypes: NodeTypes = {
  [HTTP_TRIGGER_NODE_TYPE]: HttpTriggerNode,
  [SERVICE_CALL_NODE_TYPE]: ServiceCallNode,
}
