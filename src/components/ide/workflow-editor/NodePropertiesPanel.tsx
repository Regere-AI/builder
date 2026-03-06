import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Node } from '@xyflow/react'
import { Settings2, Globe, Send, Server, Maximize2, X } from 'lucide-react'
import Select from 'react-select'
import {
  getLaunchpadSession,
  launchpadGetServices,
  launchpadGetServiceSpec,
  type LaunchpadService,
} from '@/services/api'
import { parseOpenApiPaths, type OpenApiOperation } from '@/lib/openapi-paths'
import {
  HTTP_TRIGGER_NODE_TYPE,
  type HttpTriggerNodeData,
  HTTP_REQUEST_NODE_TYPE,
  SERVICE_CALL_NODE_TYPE,
  type ServiceCallNodeData,
} from './nodes'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
const BODY_METHODS = ['POST', 'PUT', 'PATCH']

/** Matches {{ ... }}; allows } inside (e.g. {{ "}" }}). */
const MUSTACHE_REGEX = /\{\{(?:(?!\}\})[\s\S])*?\}\}/g

/** Matches "nodes." or "nodes.<id-prefix>" before cursor for autocomplete. */
const NODES_DOT_REGEX = /nodes\.([a-zA-Z0-9_-]*)$/

function RawBodyEditor({
  value,
  onChange,
  className = '',
  placeholder = '',
  rows = 6,
  minHeight = 120,
  nodeSuggestions = [],
}: {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  rows?: number
  minHeight?: number
  /** Node IDs to suggest after "nodes." (excludes current and previous node) */
  nodeSuggestions?: string[]
}) {
  const highlightRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)
  const cursorSpanRef = useRef<HTMLSpanElement>(null)
  const pendingCursorRef = useRef<number | null>(null)
  const [selectionStart, setSelectionStart] = useState(0)
  const [suggestionSelectedIndex, setSuggestionSelectedIndex] = useState(0)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null)

  const textBeforeCursor = value.slice(0, selectionStart)
  const nodesMatch = textBeforeCursor.match(NODES_DOT_REGEX)
  const suggestionPrefix = nodesMatch ? nodesMatch[1] : null
  const replaceStart = nodesMatch ? textBeforeCursor.lastIndexOf('nodes.') : -1
  const filteredSuggestions =
    suggestionPrefix != null
      ? nodeSuggestions.filter((id) => id.startsWith(suggestionPrefix))
      : []
  const showSuggestions = filteredSuggestions.length > 0 && replaceStart >= 0

  useEffect(() => {
    if (showSuggestions) setSuggestionSelectedIndex(0)
  }, [showSuggestions, suggestionPrefix])

  useEffect(() => {
    if (textareaRef.current && pendingCursorRef.current != null) {
      const pos = pendingCursorRef.current
      textareaRef.current.setSelectionRange(pos, pos)
      setSelectionStart(pos)
      pendingCursorRef.current = null
    }
  }, [value])

  useEffect(() => {
    if (!showSuggestions || !containerRef.current || !mirrorRef.current || !cursorSpanRef.current || !textareaRef.current) {
      setDropdownPosition(null)
      return
    }
    const ta = textareaRef.current
    mirrorRef.current.scrollTop = ta.scrollTop
    mirrorRef.current.scrollLeft = ta.scrollLeft
    const spanRect = cursorSpanRef.current.getBoundingClientRect()
    const containerRect = containerRef.current.getBoundingClientRect()
    setDropdownPosition({
      top: spanRect.bottom - containerRect.top + 2,
      left: spanRect.left - containerRect.left,
    })
  }, [showSuggestions, value, selectionStart, filteredSuggestions.length])

  const applySuggestion = (id: string) => {
    if (replaceStart < 0) return
    const newCursor = replaceStart + 'nodes.'.length + id.length
    const newValue =
      value.slice(0, replaceStart) + 'nodes.' + id + value.slice(selectionStart)
    pendingCursorRef.current = newCursor
    onChange(newValue)
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSuggestions) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSuggestionSelectedIndex((i) =>
        i < filteredSuggestions.length - 1 ? i + 1 : 0
      )
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSuggestionSelectedIndex((i) =>
        i > 0 ? i - 1 : filteredSuggestions.length - 1
      )
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      applySuggestion(filteredSuggestions[suggestionSelectedIndex])
      return
    }
    if (e.key === 'Escape') {
      setSuggestionSelectedIndex(0)
    }
  }

  const parts = value.split(MUSTACHE_REGEX)
  const matches = value.match(MUSTACHE_REGEX) ?? []
  const highlighted: React.ReactNode[] = []
  parts.forEach((part, i) => {
    highlighted.push(part)
    if (i < matches.length) {
      highlighted.push(
        <span key={`m-${i}`} className="text-amber-400">
          {matches[i]}
        </span>
      )
    }
  })

  const baseClass =
    'w-full rounded-md border border-[#3e3e3e] bg-[#1e1e1e] px-3 py-2 text-sm font-mono resize-y whitespace-pre-wrap break-words'
  return (
    <div ref={containerRef} className="relative">
      <div
        ref={highlightRef}
        className={`${baseClass} overflow-auto text-gray-200 py-2 ${className}`}
        style={{ paddingLeft: '0.75rem', paddingRight: '0.75rem', minHeight }}
        aria-hidden
      >
        {value ? highlighted : <span className="text-gray-500">{placeholder}</span>}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setSelectionStart(e.target.selectionStart ?? 0)
        }}
        onSelect={(e) => setSelectionStart(e.currentTarget.selectionStart)}
        onKeyDown={handleKeyDown}
        onScroll={(e) => {
          const ta = e.currentTarget
          if (highlightRef.current) {
            highlightRef.current.scrollTop = ta.scrollTop
            highlightRef.current.scrollLeft = ta.scrollLeft
          }
        }}
        placeholder={placeholder}
        rows={rows}
        className={`${baseClass} absolute inset-0 text-transparent caret-gray-300 placeholder:text-transparent focus:outline-none focus:ring-1 focus:ring-emerald-500/30 focus:border-emerald-500/60 ${className}`}
        style={{ background: 'transparent', minHeight }}
        spellCheck={false}
      />
      {showSuggestions && (
        <div
          ref={mirrorRef}
          className="absolute inset-0 overflow-auto py-2 text-sm font-mono whitespace-pre-wrap break-words pointer-events-none invisible"
          style={{ paddingLeft: '0.75rem', paddingRight: '0.75rem', minHeight }}
          aria-hidden
        >
          {textBeforeCursor}
          <span ref={cursorSpanRef} />
        </div>
      )}
      {showSuggestions && dropdownPosition && (
        <ul
          className="absolute z-10 max-h-40 overflow-auto rounded-md border border-[#3e3e3e] bg-[#252526] py-1 shadow-lg min-w-[120px]"
          style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
          role="listbox"
          aria-label="Node ID suggestions"
        >
          {filteredSuggestions.map((id, i) => (
            <li
              key={id}
              role="option"
              aria-selected={i === suggestionSelectedIndex}
              className={`cursor-pointer px-3 py-1.5 font-mono text-xs ${
                i === suggestionSelectedIndex
                  ? 'bg-emerald-600/40 text-emerald-200'
                  : 'text-gray-300 hover:bg-[#3e3e3e]'
              }`}
              onMouseDown={(e) => {
                e.preventDefault()
                applySuggestion(id)
              }}
            >
              {id}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RawBodyFullEditorModal({
  open,
  value,
  onChange,
  onClose,
  focusRingClass = 'focus:ring-emerald-500/30 focus:border-emerald-500/60',
  nodeSuggestions = [],
}: {
  open: boolean
  value: string
  onChange: (value: string) => void
  onClose: () => void
  focusRingClass?: string
  nodeSuggestions?: string[]
}) {
  const [localValue, setLocalValue] = useState(value)
  useEffect(() => {
    if (open) setLocalValue(value)
  }, [open, value])

  if (!open) return null

  const handleDone = () => {
    onChange(localValue)
    onClose()
  }

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="raw-body-full-editor-title"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative flex w-full max-w-4xl flex-col rounded-xl border border-[#404040] bg-[#252526] shadow-2xl"
        style={{ maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#3e3e3e] px-4 py-3">
          <h2 id="raw-body-full-editor-title" className="text-sm font-medium text-gray-200">
            Raw body (JSON)
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDone}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Done
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-gray-400 hover:bg-[#3e3e3e] hover:text-white"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden p-4">
          <RawBodyEditor
            value={localValue}
            onChange={setLocalValue}
            placeholder='{"key": "value"}'
            rows={18}
            minHeight={400}
            className={focusRingClass}
            nodeSuggestions={nodeSuggestions}
          />
        </div>
      </div>
    </div>
  )
  return createPortal(content, document.body)
}

export interface NodePropertiesPanelProps {
  selectedNode: Node | null
  nodeIds?: string[]
  /** Direct upstream (source) node id for the selected node; excluded from raw body node suggestions */
  previousNodeId?: string
  onUpdateNodeData: (nodeId: string, data: Record<string, unknown>) => void
  onUpdateNodeId?: (oldId: string, newId: string) => void
}

export function NodePropertiesPanel({
  selectedNode,
  nodeIds = [],
  previousNodeId,
  onUpdateNodeData,
  onUpdateNodeId,
}: NodePropertiesPanelProps) {
  if (!selectedNode) {
    return (
      <div className="flex h-full w-[300px] shrink-0 flex-col border-l border-[#3e3e3e] bg-[#252526]">
        <div className="flex items-center gap-2 border-b border-[#3e3e3e] px-4 py-3">
          <Settings2 className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">Properties</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
          <div className="rounded-full bg-[#3e3e3e] p-3">
            <Settings2 className="h-8 w-8 text-gray-500" />
          </div>
          <p className="text-sm text-gray-500">Select a node on the canvas to edit its properties</p>
        </div>
      </div>
    )
  }

  const nodeId = selectedNode.id
  const type = selectedNode.type as string
  const data = (selectedNode.data ?? {}) as Record<string, unknown>
  const nodeSuggestions = (nodeIds ?? []).filter(
    (id) => id !== nodeId && id !== previousNodeId
  )

  const handleChange = (updates: Record<string, unknown>) => {
    onUpdateNodeData(nodeId, { ...data, ...updates })
  }

  return (
    <div className="flex h-full w-[300px] shrink-0 flex-col border-l border-[#3e3e3e] bg-[#252526]">
      <div className="flex items-center gap-2 border-b border-[#3e3e3e] px-4 py-3">
        {type === HTTP_TRIGGER_NODE_TYPE ? (
          <Globe className="h-4 w-4 text-emerald-400" />
        ) : type === HTTP_REQUEST_NODE_TYPE ? (
          <Send className="h-4 w-4 text-sky-400" />
        ) : type === SERVICE_CALL_NODE_TYPE ? (
          <Server className="h-4 w-4 text-violet-400" />
        ) : (
          <Settings2 className="h-4 w-4 text-gray-400" />
        )}
        <span className="text-sm font-medium text-gray-200">
          {type === HTTP_TRIGGER_NODE_TYPE ? 'HTTP Trigger' : type === HTTP_REQUEST_NODE_TYPE ? 'HTTP Request' : type === SERVICE_CALL_NODE_TYPE ? 'Service Call' : 'Node'} properties
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <NodeIdField
          nodeId={nodeId}
          nodeIds={nodeIds}
          onUpdateNodeId={onUpdateNodeId}
        />
        {type === HTTP_TRIGGER_NODE_TYPE && (
          <HttpTriggerFields
            data={data as HttpTriggerNodeData}
            onChange={handleChange}
            nodeSuggestions={nodeSuggestions}
          />
        )}
        {type === HTTP_REQUEST_NODE_TYPE && (
          <ServiceCallFields
            data={data as ServiceCallNodeData}
            onChange={handleChange}
            nodeSuggestions={nodeSuggestions}
          />
        )}
        {type === SERVICE_CALL_NODE_TYPE && (
          <ServiceCallFields
            data={data as ServiceCallNodeData}
            onChange={handleChange}
            nodeSuggestions={nodeSuggestions}
          />
        )}
        {type !== HTTP_TRIGGER_NODE_TYPE && type !== HTTP_REQUEST_NODE_TYPE && type !== SERVICE_CALL_NODE_TYPE && (
          <p className="text-sm text-gray-500">No editable properties for this node type.</p>
        )}
      </div>
    </div>
  )
}

function NodeIdField({
  nodeId,
  nodeIds,
  onUpdateNodeId,
}: {
  nodeId: string
  nodeIds: string[]
  onUpdateNodeId?: (oldId: string, newId: string) => void
}) {
  const [idInput, setIdInput] = useState(nodeId)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setIdInput(nodeId)
    setError(null)
  }, [nodeId])

  const handleBlur = () => {
    const trimmed = idInput.trim()
    if (!trimmed) {
      setError('ID is required')
      setIdInput(nodeId)
      return
    }
    if (trimmed === nodeId) {
      setError(null)
      return
    }
    const isDuplicate = (nodeIds ?? []).some((id) => id === trimmed)
    if (isDuplicate) {
      setError('ID already in use')
      return
    }
    setError(null)
    onUpdateNodeId?.(nodeId, trimmed)
  }

  if (!onUpdateNodeId) return null

  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
        Node ID
      </label>
      <input
        type="text"
        value={idInput}
        onChange={(e) => {
          setIdInput(e.target.value)
          setError(null)
        }}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        placeholder="e.g. trigger-1"
        className="w-full rounded-md border border-[#3e3e3e] bg-[#1e1e1e] px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 outline-none focus:border-[#555] focus:ring-1 focus:ring-[#555]"
      />
      {error && <p className="mt-1 text-xs text-amber-400">{error}</p>}
    </div>
  )
}

function HttpTriggerFields({
  data,
  onChange,
  nodeSuggestions = [],
}: {
  data: HttpTriggerNodeData
  onChange: (updates: Record<string, unknown>) => void
  nodeSuggestions?: string[]
}) {
  const [fullEditorOpen, setFullEditorOpen] = useState(false)
  const method = (data.method as string) ?? 'POST'
  const showRawBody = BODY_METHODS.includes(method as (typeof BODY_METHODS)[number])
  const rawBodyValue = typeof data.rawBody === 'string' ? data.rawBody : ''

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
          Method
        </label>
        <select
          value={method}
          onChange={(e) => onChange({ method: e.target.value })}
          className="w-full rounded-md border border-[#3e3e3e] bg-[#1e1e1e] px-3 py-2 text-sm text-gray-200 outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30"
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
          Path
        </label>
        <input
          type="text"
          value={(data.path as string) ?? ''}
          onChange={(e) => onChange({ path: e.target.value.toLowerCase() })}
          placeholder="e.g. /webhook or uuid"
          className="w-full rounded-md border border-[#3e3e3e] bg-[#1e1e1e] px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
          Authentication
        </label>
        <select
          value={(data.authentication as string) ?? 'none'}
          onChange={(e) => onChange({ authentication: e.target.value as 'none' | 'bearer' })}
          className="w-full rounded-md border border-[#3e3e3e] bg-[#1e1e1e] px-3 py-2 text-sm text-gray-200 outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30"
        >
          <option value="none">None</option>
          <option value="bearer">Bearer</option>
        </select>
      </div>
      {showRawBody && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">
              Raw body (JSON)
            </label>
            <button
              type="button"
              onClick={() => setFullEditorOpen(true)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-[#3e3e3e] hover:text-gray-200"
              title="Open full editor"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Full editor
            </button>
          </div>
          <RawBodyEditor
            value={rawBodyValue}
            onChange={(v) => onChange({ rawBody: v })}
            placeholder='{"key": "value"}'
            className="focus:ring-emerald-500/30 focus:border-emerald-500/60"
            nodeSuggestions={nodeSuggestions}
          />
          <RawBodyFullEditorModal
            open={fullEditorOpen}
            value={rawBodyValue}
            onChange={(v) => onChange({ rawBody: v })}
            onClose={() => setFullEditorOpen(false)}
            focusRingClass="focus:ring-emerald-500/30 focus:border-emerald-500/60"
            nodeSuggestions={nodeSuggestions}
          />
        </div>
      )}
    </div>
  )
}

const reactSelectDarkStyles = {
  control: (base: Record<string, unknown>, state: { isFocused?: boolean }) => ({
    ...base,
    minHeight: 36,
    backgroundColor: '#1e1e1e',
    borderColor: state.isFocused ? 'rgba(139, 92, 246, 0.6)' : '#3e3e3e',
    boxShadow: state.isFocused ? '0 0 0 1px rgba(139, 92, 246, 0.3)' : 'none',
  }),
  menu: (base: Record<string, unknown>) => ({
    ...base,
    backgroundColor: '#252526',
    border: '1px solid #3e3e3e',
  }),
  option: (base: Record<string, unknown>, state: { isFocused?: boolean; isSelected?: boolean }) => ({
    ...base,
    backgroundColor: state.isSelected ? 'rgba(139, 92, 246, 0.3)' : state.isFocused ? '#3e3e3e' : 'transparent',
    color: '#e0e0e0',
  }),
  singleValue: (base: Record<string, unknown>) => ({ ...base, color: '#e0e0e0' }),
  input: (base: Record<string, unknown>) => ({ ...base, color: '#e0e0e0' }),
  placeholder: (base: Record<string, unknown>) => ({ ...base, color: '#6b7280' }),
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'bg-emerald-600/80 text-white',
    POST: 'bg-sky-600/80 text-white',
    PUT: 'bg-amber-600/80 text-white',
    PATCH: 'bg-violet-600/80 text-white',
    DELETE: 'bg-red-600/80 text-white',
    HEAD: 'bg-gray-600/80 text-white',
    OPTIONS: 'bg-gray-500/80 text-white',
  }
  const cls = colors[method] ?? 'bg-gray-600/80 text-white'
  return (
    <span className={`mr-2 inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${cls}`}>
      {method}
    </span>
  )
}

function ServiceCallFields({
  data,
  onChange,
  nodeSuggestions = [],
}: {
  data: ServiceCallNodeData
  onChange: (updates: Record<string, unknown>) => void
  nodeSuggestions?: string[]
}) {
  const [fullEditorOpen, setFullEditorOpen] = useState(false)
  const [services, setServices] = useState<LaunchpadService[]>([])
  const [servicesLoading, setServicesLoading] = useState(false)
  const [apiOperations, setApiOperations] = useState<OpenApiOperation[]>([])
  const [specLoading, setSpecLoading] = useState(false)

  const session = getLaunchpadSession()
  useEffect(() => {
    if (!session?.url) {
      setServices([])
      return
    }
    setServicesLoading(true)
    launchpadGetServices(session.url, {
      sessionToken: session.token,
      tenant: '',
    })
      .then(setServices)
      .catch(() => setServices([]))
      .finally(() => setServicesLoading(false))
  }, [session?.url, session?.token])

  const serviceSlug = (data.serviceSlug as string) ?? (data.serviceName as string) ?? ''
  useEffect(() => {
    if (!session?.url || !serviceSlug) {
      setApiOperations([])
      return
    }
    setSpecLoading(true)
    launchpadGetServiceSpec(session.url, serviceSlug, session.token)
      .then((spec) => setApiOperations(parseOpenApiPaths(spec)))
      .catch(() => setApiOperations([]))
      .finally(() => setSpecLoading(false))
  }, [session?.url, session?.token, serviceSlug])

  const method = (data.method as string) ?? 'POST'
  const showRawBody = BODY_METHODS.includes(method as (typeof BODY_METHODS)[number])
  const rawBodyValue = typeof data.rawBody === 'string' ? data.rawBody : ''

  const serviceOptions = services
    .map((s) => ({
      value: (s.slug ?? s.name ?? '').toString(),
      label: (s.name ?? s.slug ?? 'Unknown').toString(),
    }))
    .filter((o) => o.value)
  const selectedServiceOption = serviceOptions.find((o) => o.value === serviceSlug) ?? null

  const apiOptions = apiOperations.map((op) => ({
    value: `${op.method}:${op.path}`,
    label: op.path,
    method: op.method,
    operationId: op.operationId,
  }))
  const currentPath = (data.path as string) ?? ''
  const selectedApiOption =
    apiOptions.find((o) => o.method === method && o.label === currentPath) ??
    (currentPath && method ? { value: `${method}:${currentPath}`, label: currentPath, method, operationId: undefined as string | undefined } : null)

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
          Service
        </label>
        <Select<{ value: string; label: string }>
          isSearchable
          options={serviceOptions}
          value={selectedServiceOption}
          onChange={(opt) => {
            const s = services.find((sv) => (sv.slug ?? sv.name) === opt?.value)
            onChange({
              serviceSlug: opt?.value ?? '',
              serviceName: s?.name ?? opt?.label ?? '',
            })
          }}
          isLoading={servicesLoading}
          placeholder={servicesLoading ? 'Loading…' : 'Select a service'}
          isClearable
          styles={reactSelectDarkStyles}
          classNamePrefix="workflow-select"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
          API (from spec)
        </label>
        <Select<{ value: string; label: string; method: string; operationId?: string }>
          isSearchable
          options={apiOptions}
          value={selectedApiOption}
          onChange={(opt) => {
            if (opt) {
              onChange({
                method: opt.method,
                path: opt.label,
                operation: opt.operationId ?? undefined,
              })
            }
          }}
          isLoading={specLoading}
          placeholder={specLoading ? 'Loading…' : serviceSlug ? 'Select an API' : 'Select a service first'}
          isClearable
          isDisabled={!serviceSlug}
          formatOptionLabel={(option) => (
            <span className="flex items-center">
              <MethodBadge method={option.method} />
              <span className="truncate">{option.label}</span>
            </span>
          )}
          styles={reactSelectDarkStyles}
          classNamePrefix="workflow-select"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
          Authentication
        </label>
        <select
          value={(data.authentication as string) ?? 'none'}
          onChange={(e) => onChange({ authentication: e.target.value as 'none' | 'bearer' })}
          className="w-full rounded-md border border-[#3e3e3e] bg-[#1e1e1e] px-3 py-2 text-sm text-gray-200 outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/30"
        >
          <option value="none">None</option>
          <option value="bearer">Bearer</option>
        </select>
      </div>
      {showRawBody && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">
              Raw body (JSON)
            </label>
            <button
              type="button"
              onClick={() => setFullEditorOpen(true)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-[#3e3e3e] hover:text-gray-200"
              title="Open full editor"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Full editor
            </button>
          </div>
          <RawBodyEditor
            value={rawBodyValue}
            onChange={(v) => onChange({ rawBody: v })}
            placeholder='{"key": "value"}'
            className="focus:ring-violet-500/30 focus:border-violet-500/60"
            nodeSuggestions={nodeSuggestions}
          />
          <RawBodyFullEditorModal
            open={fullEditorOpen}
            value={rawBodyValue}
            onChange={(v) => onChange({ rawBody: v })}
            onClose={() => setFullEditorOpen(false)}
            focusRingClass="focus:ring-violet-500/30 focus:border-violet-500/60"
            nodeSuggestions={nodeSuggestions}
          />
        </div>
      )}
    </div>
  )
}
