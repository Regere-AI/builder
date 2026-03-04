import type { NodeTypes } from '@xyflow/react'
import { HttpTriggerNode, HTTP_TRIGGER_NODE_TYPE } from './HttpTriggerNode'
import { HttpRequestNode, HTTP_REQUEST_NODE_TYPE } from './HttpRequestNode'
import { ServiceCallNode, SERVICE_CALL_NODE_TYPE } from './ServiceCallNode'

export { HttpTriggerNode, HTTP_TRIGGER_NODE_TYPE, defaultHttpTriggerNode } from './HttpTriggerNode'
export type { HttpTriggerNodeData } from './HttpTriggerNode'
export { HttpRequestNode, HTTP_REQUEST_NODE_TYPE, defaultHttpRequestNodeData } from './HttpRequestNode'
export type { HttpRequestNodeData } from './HttpRequestNode'
export { ServiceCallNode, SERVICE_CALL_NODE_TYPE } from './ServiceCallNode'
export type { ServiceCallNodeData } from './ServiceCallNode'

export const workflowNodeTypes = {
  [HTTP_TRIGGER_NODE_TYPE]: HttpTriggerNode,
  [HTTP_REQUEST_NODE_TYPE]: HttpRequestNode,
  [SERVICE_CALL_NODE_TYPE]: ServiceCallNode,
} as NodeTypes
