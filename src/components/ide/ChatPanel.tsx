import { useState, useRef, useEffect, useCallback } from 'react'
import { X, MessageSquare, Send, GripVertical } from 'lucide-react'
import { Button } from '../ui/button'
import { Select } from '../ui/select'
import { cn } from '@/lib/utils'
import { generate, getGenerateResponseText, isTauri } from '@/desktop'

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
}

const MIN_WIDTH = 300
const MAX_WIDTH = 800
const DEFAULT_WIDTH = 320

export function ChatPanel({ isOpen, onClose, width, onWidthChange, onAgentResponse }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [agentMode, setAgentMode] = useState<'Agent' | 'Plan'>('Agent')
  const [panelWidth, setPanelWidth] = useState(width || DEFAULT_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const resizeRef = useRef<HTMLDivElement>(null)

  // Update panel width when prop changes
  useEffect(() => {
    if (width !== undefined) {
      setPanelWidth(width)
    }
  }, [width])

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
    if (!inputValue.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue.trim(),
      role: 'user',
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    const prompt = inputValue.trim()
    setInputValue('')

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
          title="Close chat (Ctrl+L)"
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
              Press Ctrl+L to toggle this panel
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
          {/* Bottom Row: Agent Selector and Send Button */}
          <div className="flex items-center justify-between p-2">
            {/* Agent Selector */}
            <Select
              value={agentMode}
              options={[
                { value: 'Agent', label: 'Agent' },
                { value: 'Plan', label: 'Plan' }
              ]}
              onChange={(value) => setAgentMode(value as 'Agent' | 'Plan')}
              className="w-16 bg-[#2d2d2d] border border-[#3e3e3e] rounded-md "
            />

            {/* Send Button */}
            <Button
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
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
