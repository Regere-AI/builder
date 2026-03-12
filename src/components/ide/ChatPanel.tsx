import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { X, MessageSquare, Send, GripVertical, FileCode } from 'lucide-react'
import { Button } from '../ui/button'
import { Select } from '../ui/select'
import { cn } from '@/lib/utils'
import { chat, getAgentResponseText, isTauri, appWriteTextFile, appCreateDir, saveFile } from '@/desktop'
import { getBuilderSettings, setBuilderSettings, type BuilderModelId } from '@/services/api'
import type { EditorSelectionPayload } from './EditorView'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { getChatApiUrl } from '@/lib/chat-api'
import {
  buildSpecFromParts,
  getTextFromParts,
  useJsonRenderMessage,
  Renderer,
  StateProvider,
  VisibilityProvider,
  ActionProvider,
} from '@json-render/react'
import type { Spec } from '@json-render/core'
import { createSpecStreamCompiler, compileSpecStream } from '@json-render/core'
import { parseMultiFileSpecStream } from '@/lib/json-render/streaming'
import { parseToSpec, isJsonRenderSpec, ensureSpecHasRoot, attachOrphanElementsToRoot, injectDefaultActions, type JsonRenderSpec } from '@/lib/json-render/layout-to-spec'
import { registry, jsonRenderActionHandlers } from '@/lib/json-render/registry'
import { jsonRenderStateStore, seedStateFromSpec } from '@/lib/json-render/zustand-store'
import { StateDebugPane } from './StateDebugPane'

const MODEL_OPTIONS: { value: BuilderModelId; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
]

interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: Date
}

export interface AgentResponsePayload {
  type: 'code'
  content: { code: string; filePath?: string; /** Full path where file was written (Tauri); dashboard uses this when activeApp is null. */ resolvedPath?: string }
}

/** Layout JSON: .json but not .workflow.json */
function isLayoutJsonPath(path: string): boolean {
  const lower = path.toLowerCase()
  return lower.endsWith('.json') && !lower.endsWith('.workflow.json')
}

/** Pick target file for this message: modify existing (from attached context) or new file. */
function getTargetFilePathFromContext(attachedContexts: EditorSelectionPayload[]): string | null {
  for (const p of attachedContexts) {
    if (p.filePath && isLayoutJsonPath(p.filePath)) return p.filePath
  }
  return null
}

/** Derive a safe filename stem from a spec's layout title (root or first element with title/label). */
function deriveTitleSlugFromSpec(spec: Record<string, unknown>): string {
  const elements = spec.elements as Record<string, { props?: Record<string, unknown> }> | undefined
  if (!elements || typeof elements !== 'object') return ''

  const getTitle = (el: { props?: Record<string, unknown> } | undefined): string => {
    if (!el?.props) return ''
    const t = el.props.title ?? el.props.label ?? el.props.name
    return typeof t === 'string' ? t.trim() : ''
  }

  const rootId = spec.root
  if (typeof rootId === 'string' && elements[rootId]) {
    const title = getTitle(elements[rootId])
    if (title) return title
  }
  for (const el of Object.values(elements)) {
    const title = getTitle(el)
    if (title) return title
  }
  return ''
}

/** Sanitize a title into a safe filename stem (lowercase, spaces to hyphens, alphanumeric + hyphen). */
function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || ''
}

/** Generate path for a new UI file: same name as layout title when available, else generated-timestamp. */
function generateNewLayoutPath(specOrNull: Record<string, unknown> | null): string {
  const slug = specOrNull ? slugifyTitle(deriveTitleSlugFromSpec(specOrNull)) : ''
  const base = slug || `generated-${Date.now()}`
  return `uiConfigs/${base}.json`
}

function pathJoin(...parts: string[]): string {
  return parts.filter(Boolean).join('/').replace(/\\/g, '/')
}

/** Extract JSON string for UI file from assistant text (raw JSON or markdown code block). */
function extractJsonForUi(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  // Try raw parse first
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed && typeof parsed === 'object') {
      const o = parsed as Record<string, unknown>
      if (typeof o.root === 'string' && o.elements != null && typeof o.elements === 'object') return JSON.stringify(parsed, null, 2)
      if (typeof (o as { type?: string }).type === 'string') return JSON.stringify(parsed, null, 2)
    }
  } catch {
    // ignore
  }
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock?.[1]) {
    try {
      const parsed = JSON.parse(codeBlock[1].trim()) as unknown
      if (parsed && typeof parsed === 'object') return JSON.stringify(parsed, null, 2)
    } catch {
      // ignore
    }
  }
  return null
}

interface ChatPanelProps {
  isOpen: boolean
  onClose: () => void
  width?: number
  onWidthChange?: (width: number) => void
  onAgentResponse?: (data: AgentResponsePayload) => void
  /** App root path (e.g. activeApp.rootPath). When set, streamed spec is written to the target file path. */
  appRootPath?: string | null
  /** Return content of an open file by path (for same-file modification and currentSpec). */
  getOpenFileContent?: (path: string) => string | null
  /** When set, add this selection to attached contexts (e.g. from Ctrl+L); shown as a chip with remove button. */
  pendingContext?: EditorSelectionPayload | null
  /** Called after pendingContext has been added to attached list. */
  onConsumePendingContext?: () => void
  /** Called with live spec while streaming (null when done). targetFilePath = file being built (modify) or null (new file). */
  onStreamingSpecChange?: (spec: Spec | null, targetFilePath?: string | null) => void
}

const MIN_WIDTH = 300
const MAX_WIDTH = 800
const DEFAULT_WIDTH = 320

const CHAT_API_URL = getChatApiUrl()

/** Renders a single assistant message. During streaming shows only JSONL text; after stream shows final UI in chat. */
function AssistantMessageBubble({
  parts,
  liveSpec,
  isStreaming,
}: {
  parts: Array<{ type: string; text?: string; data?: unknown }>
  liveSpec: Spec | null
  isStreaming: boolean
}) {
  const { spec, text } = useJsonRenderMessage(parts)
  const hasText = text.trim().length > 0
  // While streaming: show only the JSONL text (no partial UI in chat). Progressive UI is shown in Preview tab.
  const showRenderer = !isStreaming && ((liveSpec && hasText) || spec)
  const rawSpec = showRenderer ? (spec || liveSpec) : null
  // Attach orphans; inject default on.press for interactive elements so State panel shows all actions
  const displaySpec =
    rawSpec && isJsonRenderSpec(rawSpec)
      ? injectDefaultActions(attachOrphanElementsToRoot(rawSpec as JsonRenderSpec))
      : rawSpec

  // Seed store from spec.state so State panel shows form/action state (same store as Preview)
  useEffect(() => {
    if (displaySpec && typeof displaySpec === 'object') seedStateFromSpec(displaySpec as { state?: Record<string, unknown> })
  }, [displaySpec])

  return (
    <div className="flex flex-col gap-2 w-full max-w-[85%]">
      {hasText && (
        <p className="text-sm text-gray-300 whitespace-pre-wrap break-words font-mono">{text}</p>
      )}
      {isStreaming && !hasText && <p className="text-sm text-gray-500">…</p>}
      {displaySpec && (
        <div className="flex flex-col gap-2">
          <div className="rounded-md border border-[#3e3e3e] bg-[#1e1e1e] p-3 overflow-auto max-h-[280px]">
            <StateProvider store={jsonRenderStateStore}>
              <VisibilityProvider>
                <ActionProvider handlers={jsonRenderActionHandlers}>
                  <Renderer spec={displaySpec as Spec} registry={registry} loading={false} />
                </ActionProvider>
              </VisibilityProvider>
            </StateProvider>
          </div>
          <StateDebugPane defaultCollapsed label="State" />
        </div>
      )}
    </div>
  )
}

export function ChatPanel({ isOpen, onClose, width, onWidthChange, onAgentResponse, appRootPath, getOpenFileContent, pendingContext, onConsumePendingContext, onStreamingSpecChange }: ChatPanelProps) {
  const [inputValue, setInputValue] = useState('')
  const [agentMode, setAgentMode] = useState<'Agent' | 'Plan'>('Agent')
  const [selectedModel, setSelectedModel] = useState<BuilderModelId>(() => {
    const stored = getBuilderSettings().selectedModel
    return (stored ?? 'openai') as BuilderModelId
  })
  const [panelWidth, setPanelWidth] = useState(width || DEFAULT_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const [attachedContexts, setAttachedContexts] = useState<EditorSelectionPayload[]>([])
  const lastAddedContextKeyRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const resizeRef = useRef<HTMLDivElement>(null)
  const specStreamRef = useRef<{
    messageId: string
    compiler: ReturnType<typeof createSpecStreamCompiler<Record<string, unknown>>>
    lastPushedLength: number
  } | null>(null)

  /** Last finalized spec (after stream ends). Sent as currentSpec on next message for same-layout patches. */
  const lastFinalSpecRef = useRef<Spec | null>(null)
  /** Spec we sent with the current request (used as initial for compiler when stream starts). */
  const sentCurrentSpecRef = useRef<Spec | null>(null)
  /** Path of the file we're building in the current stream (modify this file) or null (new file). Set on send. */
  const streamingTargetFilePathRef = useRef<string | null>(null)
  /** Captured when stream starts so stream-end effect uses the correct path (ref can be overwritten by next send). */
  const streamingTargetFilePathForCurrentStreamRef = useRef<string | null>(null)

  /** Live spec while the last assistant message is streaming (progressive SpecStream rendering). */
  const [liveStreamingSpec, setLiveStreamingSpec] = useState<Spec | null>(null)
  /** Shown when streaming finishes and generated JSON was written to file. */
  const [uiGeneratedMessage, setUiGeneratedMessage] = useState<string | null>(null)

  useEffect(() => {
    onStreamingSpecChange?.(liveStreamingSpec, streamingTargetFilePathRef.current)
  }, [liveStreamingSpec, onStreamingSpecChange])

  const chatBodyRef = useRef<Record<string, unknown>>(function initBody() {
    const s = getBuilderSettings()
    return {
      model: (s.selectedModel ?? 'openai') as BuilderModelId,
      openaiApiKey: s.openaiApiKey,
      claudeApiKey: s.claudeApiKey,
      googleApiKey: s.googleApiKey,
      currentSpec: undefined as Spec | undefined,
    }
  }())
  useEffect(() => {
    const s = getBuilderSettings()
    if (!s.selectedModel) setBuilderSettings({ selectedModel: 'openai' })
  }, [])
  useEffect(() => {
    const prev = chatBodyRef.current
    chatBodyRef.current = {
      ...prev,
      model: selectedModel,
      openaiApiKey: getBuilderSettings().openaiApiKey,
      claudeApiKey: getBuilderSettings().claudeApiKey,
      googleApiKey: getBuilderSettings().googleApiKey,
    }
  }, [selectedModel])

  const transport = useMemo(
    () =>
      CHAT_API_URL
        ? new DefaultChatTransport({
            api: CHAT_API_URL,
            body: () => chatBodyRef.current,
          })
        : undefined,
    []
  )

  const {
    messages: aiMessages,
    sendMessage,
    status: aiStatus,
    error: aiError,
  } = useChat(transport ? { transport } : { transport: undefined! })

  const isLoading = aiStatus === 'streaming' || aiStatus === 'submitted'
  const messages: Message[] = useMemo(() => {
    return aiMessages.map((m) => ({
      id: m.id,
      content: getTextFromParts(m.parts ?? []),
      role: m.role as 'user' | 'assistant',
      timestamp: new Date(),
    }))
  }, [aiMessages])

  // Progressive SpecStream: update live spec as the assistant message streams
  useEffect(() => {
    if (aiStatus !== 'streaming') {
      setLiveStreamingSpec(null)
      return
    }
    const last = aiMessages[aiMessages.length - 1]
    if (!last || last.role !== 'assistant') {
      setLiveStreamingSpec(null)
      return
    }
    const text = getTextFromParts(last.parts ?? [])
    if (!text.trim()) {
      setLiveStreamingSpec(null)
      return
    }
    if (!specStreamRef.current || specStreamRef.current.messageId !== last.id) {
      streamingTargetFilePathForCurrentStreamRef.current = streamingTargetFilePathRef.current
      // Same-layout modification: when we sent currentSpec, apply patches on top of it
      const initial = sentCurrentSpecRef.current
        ? (JSON.parse(JSON.stringify(sentCurrentSpecRef.current)) as Record<string, unknown>)
        : undefined
      specStreamRef.current = {
        messageId: last.id,
        compiler: createSpecStreamCompiler<Record<string, unknown>>(initial),
        lastPushedLength: 0,
      }
    }
    const state = specStreamRef.current
    const toPush = text.slice(state.lastPushedLength)
    if (toPush) {
      try {
        const { result } = state.compiler.push(toPush)
        state.lastPushedLength = text.length
        if (result && isJsonRenderSpec(result)) {
          setLiveStreamingSpec(result as Spec)
        }
      } catch {
        try {
          const spec = compileSpecStream<Record<string, unknown>>(text)
          if (isJsonRenderSpec(spec)) setLiveStreamingSpec(spec as Spec)
        } catch {
          setLiveStreamingSpec(null)
        }
      }
    }
  }, [aiMessages, aiStatus])

  // Update panel width when prop changes
  useEffect(() => {
    if (width !== undefined) {
      setPanelWidth(width)
    }
  }, [width])

  const contextKey = useCallback((p: EditorSelectionPayload) =>
    `${p.filePath}:${p.startLine}:${p.endLine}:${p.text}`, [])

  // Format selection for prompt: file path, line range, and code with line numbers
  const formatSelectionCard = useCallback((payload: EditorSelectionPayload): string => {
    const { filePath, startLine, endLine, text } = payload
    const lines = text.split('\n')
    const withLineNumbers = lines
      .map((line, i) => `${startLine + i} | ${line}`)
      .join('\n')
    const fileLabel = filePath ? filePath.replace(/^.*[/\\]/, '') : 'selection'
    const lineRange = startLine > 0 && endLine >= startLine
      ? ` (lines ${startLine}-${endLine})`
      : ''
    return `\`${fileLabel}\`${lineRange}\n\n\`\`\`\n${withLineNumbers}\n\`\`\``
  }, [])

  // Add pending context to attached list (dedupe by key), then consume. Ref prevents duplicate when effect or event fires twice before state flushes.
  useEffect(() => {
    if (!pendingContext?.text?.trim()) {
      lastAddedContextKeyRef.current = null
      return
    }
    const key = contextKey(pendingContext)
    if (lastAddedContextKeyRef.current === key) {
      onConsumePendingContext?.()
      return
    }
    lastAddedContextKeyRef.current = key
    setAttachedContexts((prev) => {
      if (prev.some((p) => contextKey(p) === key)) return prev
      return [...prev, pendingContext]
    })
    onConsumePendingContext?.()
  }, [pendingContext, onConsumePendingContext, contextKey])

  const removeAttachedContext = useCallback((index: number) => {
    setAttachedContexts((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Keyboard shortcut handler for Tab+Shift to toggle agent mode
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Tab+Shift combination
      if (e.key === 'Tab' && e.shiftKey) {
        // Only trigger if input is focused or no input is focused
        const activeElement = document.activeElement
        if (activeElement === inputRef.current || activeElement === document.body) {
          e.preventDefault()
          setAgentMode((prev) => prev === 'Agent' ? 'Plan' : 'Agent')
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  // Handle resize drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      
      const newWidth = window.innerWidth - e.clientX
      const clampedWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth))
      setPanelWidth(clampedWidth)
      onWidthChange?.(clampedWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    
    // Prevent text selection while resizing
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [isResizing, onWidthChange])

  // When streaming finishes, write last assistant message to uiConfigs/generated.json (local file so user can edit).
  useEffect(() => {
    const last = aiMessages[aiMessages.length - 1]
    if (!last || last.role !== 'assistant') return
    // Only write when stream is done so we have complete JSON
    if (aiStatus === 'streaming' || aiStatus === 'submitted') return

    const text = getTextFromParts(last.parts ?? [])
    if (!text.trim() && !last.parts?.length) return

    let code: string | null = null

    // 1) Build spec with @json-render/core: SpecStream (JSONL patches) or one-shot compile
    if (text.trim()) {
      const prev = specStreamRef.current
      if (!prev || prev.messageId !== last.id) {
        specStreamRef.current = {
          messageId: last.id,
          compiler: createSpecStreamCompiler<Record<string, unknown>>(),
          lastPushedLength: 0,
        }
      }
      const state = specStreamRef.current
      if (state) {
        const toPush = text.slice(state.lastPushedLength)
        if (toPush) {
          try {
            const { result } = state.compiler.push(toPush)
            state.lastPushedLength = text.length
            if (result && isJsonRenderSpec(result)) {
              code = JSON.stringify(result, null, 2)
            }
          } catch {
            // one-shot compile of full text (e.g. complete JSONL)
            try {
              const spec = compileSpecStream<Record<string, unknown>>(text)
              if (isJsonRenderSpec(spec)) code = JSON.stringify(spec, null, 2)
            } catch {
              // ignore
            }
          }
        }
        // If we already pushed everything during streaming, get result from compiler (e.g. refinement mode)
        if (!code) {
          try {
            const result = state.compiler.getResult()
            if (result && isJsonRenderSpec(result)) code = JSON.stringify(result, null, 2)
          } catch {
            // ignore
          }
        }
      }
    }

    // 2) Fallback: buildSpecFromParts (data parts) or parseToSpec; only use if result is a valid spec
    if (!code) {
      const specFromParts = last.parts?.length ? buildSpecFromParts(last.parts) : null
      const parsedSpec = specFromParts ? null : parseToSpec(text)
      const fallbackJson = specFromParts ? JSON.stringify(specFromParts, null, 2) : (parsedSpec ? JSON.stringify(parsedSpec, null, 2) : extractJsonForUi(text))
      if (fallbackJson) {
        try {
          const parsed = JSON.parse(fallbackJson) as unknown
          if (isJsonRenderSpec(parsed)) code = fallbackJson
        } catch {
          // ignore
        }
      }
    }

    // 3) Lenient: if stream looks like JSONL, compile and use so we always write when there's JSON
    if (!code && text.trim()) {
      try {
        const spec = compileSpecStream<Record<string, unknown>>(text)
        if (spec && typeof spec === 'object') code = JSON.stringify(spec, null, 2)
      } catch {
        // ignore
      }
    }

    if (!code) return

    const looksAbsolute = (p: string) => /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('/')

    // Multi-file: when the model outputs {"@file":"path"} then JSONL per file, write each to its path so contact.json stays contact.json
    const segments = parseMultiFileSpecStream(text)
    const useMultiFile =
      segments.length > 1 || (segments.length === 1 && segments[0].path !== '')
    if (useMultiFile) {
      const filesToWrite: { relativePath: string; code: string }[] = []
      for (const seg of segments) {
        try {
          const spec = compileSpecStream<Record<string, unknown>>(seg.jsonl)
          if (!spec || !isJsonRenderSpec(spec)) continue
          const parsed = spec as Record<string, unknown>
          const normalized = ensureSpecHasRoot(parsed)
          const finalSpec = (normalized ?? parsed) as Record<string, unknown>
          const path = seg.path || generateNewLayoutPath(finalSpec)
          filesToWrite.push({
            relativePath: path,
            code: JSON.stringify(finalSpec, null, 2),
          })
        } catch {
          // skip invalid segment
        }
      }
      if (filesToWrite.length > 0) {
        sentCurrentSpecRef.current = null
        streamingTargetFilePathForCurrentStreamRef.current = filesToWrite[0].relativePath
        const lastFile = filesToWrite[filesToWrite.length - 1]
        const notify = (resolvedPath?: string) => {
          setUiGeneratedMessage(filesToWrite.length > 1 ? 'New UI files created' : 'New UI file created')
          onAgentResponse?.({
            type: 'code',
            content: {
              code: lastFile.code,
              filePath: lastFile.relativePath,
              ...(resolvedPath && { resolvedPath }),
            },
          })
        }
        if (isTauri()) {
          const doWrite = async () => {
            if (appRootPath) {
              const dirPath = pathJoin(appRootPath, 'uiConfigs')
              await appCreateDir(dirPath, true)
              for (const { relativePath, code: fileCode } of filesToWrite) {
                if (!looksAbsolute(relativePath)) {
                  const fullPath = pathJoin(appRootPath, relativePath)
                  await appWriteTextFile(fullPath, fileCode)
                }
              }
              const lastFull = appRootPath && !looksAbsolute(lastFile.relativePath)
                ? pathJoin(appRootPath, lastFile.relativePath)
                : undefined
              notify(lastFull)
            } else {
              for (const { relativePath, code: fileCode } of filesToWrite) {
                const name = relativePath.split(/[/\\]/).pop() || 'generated.json'
                await saveFile(fileCode, name)
              }
              notify()
            }
          }
          void doWrite().catch((e) => {
            console.error('Failed to write UI file(s):', e)
            notify()
          })
        } else {
          const lastCode = lastFile.code
          const blob = new Blob([lastCode], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = lastFile.relativePath.split(/[/\\]/).pop() || 'generated.json'
          a.click()
          URL.revokeObjectURL(url)
          notify()
        }
        return
      }
    }

    // Single-file: ensure root, then write to target path or derived path
    let parsed: Record<string, unknown> | null = null
    try {
      parsed = JSON.parse(code) as Record<string, unknown>
      const normalized = ensureSpecHasRoot(parsed)
      if (normalized) code = JSON.stringify(normalized, null, 2)
      if (isJsonRenderSpec(parsed)) lastFinalSpecRef.current = (normalized ?? parsed) as Spec
    } catch {
      // keep code as-is
    }
    sentCurrentSpecRef.current = null

    const targetFilePath = streamingTargetFilePathForCurrentStreamRef.current
    const isNewFile = !targetFilePath
    const relativePath = targetFilePath ?? generateNewLayoutPath(parsed)
    const fullPathForWrite =
      appRootPath && !looksAbsolute(relativePath)
        ? pathJoin(appRootPath, relativePath)
        : relativePath

    const notifyAndOpen = (resolvedPath?: string) => {
      setUiGeneratedMessage(isNewFile ? 'New UI file created' : 'UI file updated')
      onAgentResponse?.({
        type: 'code',
        content: { code, filePath: relativePath, ...(resolvedPath && { resolvedPath }) },
      })
    }

    if (isTauri()) {
      const doWrite = async () => {
        if (appRootPath && !looksAbsolute(relativePath)) {
          const dirPath = pathJoin(appRootPath, 'uiConfigs')
          await appCreateDir(dirPath, true)
          await appWriteTextFile(fullPathForWrite, code!)
          notifyAndOpen(fullPathForWrite)
        } else if (!appRootPath || looksAbsolute(relativePath)) {
          if (looksAbsolute(relativePath)) {
            await appWriteTextFile(relativePath, code!)
            notifyAndOpen(relativePath)
          } else {
            const defaultName = relativePath.split(/[/\\]/).pop() || 'generated.json'
            const result = await saveFile(code!, defaultName)
            if (result?.success && result.filePath) {
              notifyAndOpen(result.filePath)
            } else {
              notifyAndOpen()
            }
          }
        }
      }
      void doWrite().catch((e) => {
        console.error('Failed to write UI file:', e)
        notifyAndOpen()
      })
    } else {
      const blob = new Blob([code], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = relativePath.split(/[/\\]/).pop() || 'generated.json'
      a.click()
      URL.revokeObjectURL(url)
      notifyAndOpen()
    }
  }, [aiMessages, aiStatus, onAgentResponse, appRootPath])

  const handleSend = async () => {
    const hasInput = inputValue.trim().length > 0
    const hasContext = attachedContexts.length > 0
    if (!hasInput && !hasContext) return

    const contextBlocks = attachedContexts.map(formatSelectionCard)
    const prompt = contextBlocks.length > 0
      ? contextBlocks.join('\n\n') + (hasInput ? '\n\n' + inputValue.trim() : '')
      : inputValue.trim()

    setInputValue('')
    setAttachedContexts([])
    setUiGeneratedMessage(null)

    if (CHAT_API_URL && transport) {
      try {
        const targetFilePath = getTargetFilePathFromContext(attachedContexts)
        streamingTargetFilePathRef.current = targetFilePath

        if (targetFilePath && getOpenFileContent) {
          const content = getOpenFileContent(targetFilePath)
          if (content) {
            try {
              const parsed = JSON.parse(content) as unknown
              if (isJsonRenderSpec(parsed)) {
                chatBodyRef.current.currentSpec = parsed as Spec
                sentCurrentSpecRef.current = parsed as Spec
              }
            } catch {
              // use last final spec or undefined
              chatBodyRef.current.currentSpec = lastFinalSpecRef.current ?? undefined
              sentCurrentSpecRef.current = lastFinalSpecRef.current
            }
          } else {
            chatBodyRef.current.currentSpec = lastFinalSpecRef.current ?? undefined
            sentCurrentSpecRef.current = lastFinalSpecRef.current
          }
        } else {
          chatBodyRef.current.currentSpec = undefined
          sentCurrentSpecRef.current = null
        }
        await sendMessage({ text: prompt })
      } catch (err) {
        console.error('Chat send failed:', err)
      }
      return
    }

    if (isTauri()) {
      try {
        const targetFilePath = getTargetFilePathFromContext(attachedContexts)
        streamingTargetFilePathRef.current = targetFilePath
        const isJson = (s: string) => s.trimStart().startsWith('{') || s.trimStart().startsWith('[')
        const isPlanMode = agentMode === 'Plan'
        const response = await chat({
          messages: [{ role: 'user', parts: [{ type: 'text', text: prompt }] }],
          agentMode: !isPlanMode,
          planOnly: isPlanMode,
          currentUI: null,
        })
        const text = getAgentResponseText(response)
        const codeForPreview =
          text?.trim() ||
          (response && typeof response === 'object' && (response as Record<string, unknown>).ui != null
            ? JSON.stringify((response as Record<string, unknown>).ui, null, 2)
            : '')
        if (codeForPreview) {
          let parsedForPath: Record<string, unknown> | null = null
          if (isJson(codeForPreview)) {
            try {
              parsedForPath = JSON.parse(codeForPreview) as Record<string, unknown>
            } catch {
              // ignore
            }
          }
          const relativePath = targetFilePath ?? generateNewLayoutPath(parsedForPath)
          const filePath = isJson(codeForPreview) ? relativePath : 'uiConfigs/generated.tsx'
          if (isJson(codeForPreview)) {
            const doWrite = async () => {
              let resolvedPath: string | undefined
              const looksAbsolute = (p: string) => /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('/')
              if (appRootPath && !looksAbsolute(relativePath)) {
                const fullPath = pathJoin(appRootPath, relativePath)
                const dirPath = pathJoin(appRootPath, 'uiConfigs')
                await appCreateDir(dirPath, true)
                await appWriteTextFile(fullPath, codeForPreview)
                resolvedPath = fullPath
              } else {
                const result = await saveFile(codeForPreview, relativePath.split(/[/\\]/).pop() || 'generated.json')
                if (result?.success && result.filePath) resolvedPath = result.filePath
              }
              onAgentResponse?.({
                type: 'code',
                content: { code: codeForPreview, filePath: relativePath, ...(resolvedPath && { resolvedPath }) },
              })
            }
            void doWrite().catch((e) => {
              console.error('Failed to write UI file:', e)
              onAgentResponse?.({ type: 'code', content: { code: codeForPreview, filePath: relativePath } })
            })
          } else {
            onAgentResponse?.({ type: 'code', content: { code: codeForPreview, filePath } })
          }
        }
      } catch (err) {
        console.error('Tauri chat failed:', err)
      }
    }
  }

  if (!isOpen) return null

  return (
    <div 
      className="bg-[#252526] border-l border-[#3e3e3e] flex flex-col h-full relative"
      style={{ width: `${panelWidth}px`, transition: isResizing ? 'none' : 'width 0.2s ease' }}
    >
      {/* Resize Handle */}
      <div
        ref={resizeRef}
        onMouseDown={handleMouseDown}
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#007acc] transition-colors z-10",
          isResizing && "bg-[#007acc]"
        )}
        title="Drag to resize"
      >
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 hover:opacity-100 transition-opacity">
          <GripVertical className="w-3 h-6 text-[#007acc]" />
        </div>
      </div>

      {/* Header */}
      <div className="h-12 border-b border-[#3e3e3e] flex items-center justify-between px-4 bg-[#2d2d2d]">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-300">Chat</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-[#3e3e3e] rounded transition-colors"
          title="Close chat (Ctrl+K)"
        >
          <X className="w-4 h-4 text-gray-400 hover:text-gray-200" />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <MessageSquare className="w-12 h-12 text-gray-600 mb-4" />
            <p className="text-sm text-gray-500">
              Start a conversation by typing a message below.
            </p>
            <p className="text-xs text-gray-600 mt-2">
              Select code and press Ctrl+L to add it to the chat
            </p>
          </div>
        ) : (
          messages.map((message) => {
            const aiMsg = aiMessages.find((m) => m.id === message.id)
            const isLastAssistant = message.role === 'assistant' && aiMessages[aiMessages.length - 1]?.id === message.id
            return (
              <div
                key={message.id}
                className={cn(
                  'max-w-[80%] min-w-0 rounded-lg px-3 py-2 text-sm break-words',
                  message.role === 'user'
                    ? 'bg-[#007acc] text-white'
                    : 'bg-[#2d2d2d] text-gray-300 border border-[#3e3e3e]'
                )}
              >
                {message.role === 'user' ? (
                  <div className="max-w-[80%] rounded-lg px-3 py-2 text-sm bg-[#007acc] text-white">
                    {message.content}
                  </div>
                ) : (
                  <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-[#2d2d2d] text-gray-300 border border-[#3e3e3e]">
                    <AssistantMessageBubble
                      parts={aiMsg?.parts ?? []}
                      liveSpec={isLastAssistant ? liveStreamingSpec : null}
                      isStreaming={isLastAssistant && isLoading}
                    />
                  </div>
                )}
                <span className="text-xs text-gray-600">
                  {message.timestamp.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-[#3e3e3e] p-4 bg-[#2d2d2d]">
        {uiGeneratedMessage && !isLoading && (
          <div className="mb-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-sm text-emerald-400">
            {uiGeneratedMessage}
          </div>
        )}
        {aiError && (
          <div className="mb-2 rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-400">
            {aiError.message.includes('fetch') || aiError.message === 'Load failed' || aiError.message.includes('Failed to fetch')
              ? 'Chat server not running. Start it with: npm run chat:server (or npm run dev:with-chat to run app and chat server together).'
              : aiError.message.includes('500') || aiError.message.toLowerCase().includes('internal server error')
                ? `Server error: ${aiError.message}. Check the terminal where you run "npm run chat:server" for details. Ensure your API key is set in Builder Settings (gear icon).`
                : aiError.message}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {/* Input Field Container */}
          <div className="bg-[#1e1e1e] border border-[#3e3e3e] rounded-md focus-within:ring-2 focus-within:ring-[#007acc] focus-within:ring-offset-2 focus-within:ring-offset-[#2d2d2d] focus-within:border-[#007acc]">
            {/* Context chips (Cursor-style): file + line range + remove */}
            {attachedContexts.length > 0 && (
              <div className="flex flex-wrap gap-2 px-3 pt-3">
                {attachedContexts.map((payload, index) => {
                  const fileLabel = payload.filePath ? payload.filePath.replace(/^.*[/\\]/, '') : 'selection'
                  const lineLabel = payload.startLine > 0 && payload.endLine >= payload.startLine
                    ? `(${payload.startLine}-${payload.endLine})`
                    : ''
                  return (
                    <div
                      key={contextKey(payload)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#2d2d2d] border border-[#3e3e3e] px-2.5 py-1.5 text-sm text-gray-300"
                    >
                      <FileCode className="w-3.5 h-3.5 text-[#7eb8da] shrink-0" />
                      <span className="truncate max-w-[180px]">
                        {fileLabel} {lineLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAttachedContext(index)}
                        className="p-0.5 rounded hover:bg-[#3e3e3e] text-gray-400 hover:text-gray-200 shrink-0"
                        title="Remove context"
                        aria-label="Remove context"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={
                agentMode === 'Agent' 
                  ? "Ask Agent"
                  : "Plan your task..."
              }
              rows={3}
              className="w-full bg-transparent border-0 outline-none px-3 py-3 text-sm text-gray-300 placeholder:text-gray-600 focus:outline-none resize-none custom-scrollbar"
            />
          {/* Bottom Row: Model, Agent/Plan, and Send Button */}
          <div className="flex items-center justify-between gap-2 p-2">
            <div className="flex items-center gap-2 shrink-0">
              {/* Model selector */}
              <Select
                value={selectedModel}
                options={MODEL_OPTIONS}
                onChange={(value) => {
                  const model = value as BuilderModelId
                  setSelectedModel(model)
                  setBuilderSettings({ selectedModel: model })
                }}
                className="min-w-[90px] bg-[#2d2d2d] border border-[#3e3e3e] rounded-md"
              />
              {/* Agent / Plan selector */}
              <Select
                value={agentMode}
                options={[
                  { value: 'Agent', label: 'Agent' },
                  { value: 'Plan', label: 'Plan' }
                ]}
                onChange={(value) => setAgentMode(value as 'Agent' | 'Plan')}
                className="w-16 bg-[#2d2d2d] border border-[#3e3e3e] rounded-md"
              />
            </div>

            {/* Send Button */}
            <Button
              onClick={handleSend}
              disabled={(!inputValue.trim() && attachedContexts.length === 0) || isLoading}
              className="text-white px-4 bg-[#2d2d2d]"
              size="default"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          </div>

        </div>
      </div>
    </div>
  )
}
