import { useState, useRef, useEffect, useCallback } from 'react'
import { X, MessageSquare, Send, GripVertical, FileCode } from 'lucide-react'
import { Button } from '../ui/button'
import { Select } from '../ui/select'
import { cn } from '@/lib/utils'
import { generate, getGenerateResponseText, isTauri } from '@/desktop'
import { getBuilderSettings, setBuilderSettings, type BuilderModelId } from '@/services/api'
import type { EditorSelectionPayload } from './EditorView'

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
  content: { code: string; filePath?: string }
}

interface ChatPanelProps {
  isOpen: boolean
  onClose: () => void
  width?: number
  onWidthChange?: (width: number) => void
  onAgentResponse?: (data: AgentResponsePayload) => void
  /** When set, add this selection to attached contexts (e.g. from Ctrl+L); shown as a chip with remove button. */
  pendingContext?: EditorSelectionPayload | null
  /** Called after pendingContext has been added to attached list. */
  onConsumePendingContext?: () => void
}

const MIN_WIDTH = 300
const MAX_WIDTH = 800
const DEFAULT_WIDTH = 320

export function ChatPanel({ isOpen, onClose, width, onWidthChange, onAgentResponse, pendingContext, onConsumePendingContext }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [agentMode, setAgentMode] = useState<'Agent' | 'Plan'>('Agent')
  const [selectedModel, setSelectedModel] = useState<BuilderModelId>(() => {
    const stored = getBuilderSettings().selectedModel
    if (stored === 'claude') return 'anthropic' // migrate legacy value
    return stored ?? 'openai'
  })
  const [panelWidth, setPanelWidth] = useState(width || DEFAULT_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [attachedContexts, setAttachedContexts] = useState<EditorSelectionPayload[]>([])
  const lastAddedContextKeyRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const resizeRef = useRef<HTMLDivElement>(null)

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

  const handleSend = async () => {
    const hasInput = inputValue.trim().length > 0
    const hasContext = attachedContexts.length > 0
    if (!hasInput && !hasContext) return

    const contextBlocks = attachedContexts.map(formatSelectionCard)
    const prompt = contextBlocks.length > 0
      ? contextBlocks.join('\n\n') + (hasInput ? '\n\n' + inputValue.trim() : '')
      : inputValue.trim()

    const userMessage: Message = {
      id: Date.now().toString(),
      content: prompt,
      role: 'user',
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setAttachedContexts([])

    const assistantId = (Date.now() + 1).toString()
    setMessages((prev) => [
      ...prev,
      { id: assistantId, content: '', role: 'assistant', timestamp: new Date() },
    ])
    setIsLoading(true)

    if (isTauri()) {
      try {
        const response = await generate(prompt, {
          stream: false,
          mode: 'generator',
          includeSteps: false,
          model: selectedModel,
        })
        const text = getGenerateResponseText(response)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: text || '(No content)' } : m
          )
        )
        if (text) {
          const trimmed = text.trim()
          const isJson = trimmed.startsWith('{') || trimmed.startsWith('[')
          onAgentResponse?.({
            type: 'code',
            content: { code: text, filePath: isJson ? 'uiConfigs/generated.json' : 'uiConfigs/generated.tsx' },
          })
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: `Error: ${errorMessage}` } : m
          )
        )
      } finally {
        setIsLoading(false)
      }
    } else {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: 'Chat requires the desktop app (Tauri). Run: npm run tauri dev' }
            : m
        )
      )
      setIsLoading(false)
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
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex flex-col gap-1',
                message.role === 'user' ? 'items-end' : 'items-start'
              )}
            >
              <div
                className={cn(
                  'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                  message.role === 'user'
                    ? 'bg-[#007acc] text-white'
                    : 'bg-[#2d2d2d] text-gray-300 border border-[#3e3e3e]'
                )}
              >
                {message.content || (message.role === 'assistant' && isLoading ? '…' : '')}
              </div>
              <span className="text-xs text-gray-600">
                {message.timestamp.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-[#3e3e3e] p-4 bg-[#2d2d2d]">
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
