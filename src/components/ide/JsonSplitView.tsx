import { useState, useRef, useEffect, useCallback } from 'react'
import { JsonEditor } from '@visual-json/react'
import type { JsonValue } from '@visual-json/core'
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import type { editor } from 'monaco-editor'
import type { GetEditorSelection } from './EditorView'

loader.config({ monaco })

interface File {
  path: string
  name: string
  content: string
}

interface DiffRange {
  startLine: number
  endLine: number
}

interface JsonSplitViewProps {
  file: File
  diffRanges?: DiffRange[]
  onChange?: (value: string) => void
  onSave?: () => void
  onRegisterGetSelection?: (getSelection: GetEditorSelection) => void
}

function tryParseJson(content: string): { value: JsonValue; error: string | null } {
  const trimmed = content.trim()
  if (!trimmed) return { value: null, error: null }
  try {
    const value = JSON.parse(content) as JsonValue
    return { value, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { value: null, error: message }
  }
}

const DEFAULT_JSON: JsonValue = null

export function JsonSplitView({
  file,
  diffRanges = [],
  onChange,
  onSave,
  onRegisterGetSelection,
}: JsonSplitViewProps) {
  const { value: initialValue, error: initialError } = tryParseJson(file.content)
  const [codeContent, setCodeContent] = useState(file.content)
  const [lastValidValue, setLastValidValue] = useState<JsonValue>(initialError == null ? initialValue : DEFAULT_JSON)
  const [parseError, setParseError] = useState<string | null>(initialError)
  const leftWidthPercent = useRef(50)
  const [leftWidth, setLeftWidth] = useState(50)
  const isDragging = useRef(false)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const filePathRef = useRef(file.path)
  filePathRef.current = file.path
  const onRegisterRef = useRef(onRegisterGetSelection)
  onRegisterRef.current = onRegisterGetSelection

  // Sync from file only when switching to a different file. When we edit (left or right),
  // we update state in the handlers and notify parent; we must not overwrite with
  // file.content here or the editor will reset and edits won't stick.
  useEffect(() => {
    setCodeContent(file.content)
    const { value, error } = tryParseJson(file.content)
    setParseError(error)
    if (error == null) setLastValidValue(value)
  }, [file.path])

  const handleJsonEditorChange = useCallback(
    (value: JsonValue) => {
      setLastValidValue(value)
      try {
        const next = JSON.stringify(value, null, 2)
        setCodeContent(next)
        setParseError(null)
        onChange?.(next)
      } catch {
        // ignore
      }
    },
    [onChange]
  )

  const handleCodeChange = useCallback(
    (value: string | undefined) => {
      const next = value ?? ''
      const { value: parsed, error } = tryParseJson(next)
      setParseError(error)
      if (error == null) setLastValidValue(parsed)
      setCodeContent(next)
      onChange?.(next)
    },
    [onChange]
  )

  // Save shortcut
  useEffect(() => {
    const handleSave = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modifierKey = isMac ? e.metaKey : e.ctrlKey
      if (modifierKey && e.key === 's') {
        e.preventDefault()
        onSave?.()
      }
    }
    window.addEventListener('keydown', handleSave)
    return () => window.removeEventListener('keydown', handleSave)
  }, [onSave])

  // Resize drag
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const container = document.getElementById('json-split-container')
      if (!container) return
      const rect = container.getBoundingClientRect()
      const pct = Math.min(90, Math.max(10, ((e.clientX - rect.left) / rect.width) * 100))
      leftWidthPercent.current = pct
      setLeftWidth(pct)
    }
    const onMouseUp = () => {
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const decorationIdsRef = useRef<string[]>([])

  const handleEditorDidMount = (editor: editor.IStandaloneCodeEditor) => {
    editorRef.current = editor
    onRegisterGetSelection?.(() => {
      const ed = editorRef.current
      if (!ed) return null
      const model = ed.getModel()
      const selection = ed.getSelection()
      if (!model || !selection) return null
      const text = model.getValueInRange(selection).trim()
      if (!text) return null
      return {
        filePath: filePathRef.current,
        startLine: selection.startLineNumber,
        endLine: selection.endLineNumber,
        text,
      }
    })
  }

  useEffect(() => {
    const ed = editorRef.current
    if (!ed || !diffRanges.length) return
    const model = ed.getModel()
    if (!model) return
    if (decorationIdsRef.current.length > 0) {
      ed.deltaDecorations(decorationIdsRef.current, [])
      decorationIdsRef.current = []
    }
    const decorations: monaco.editor.IModelDeltaDecoration[] = diffRanges.map((range) => ({
      range: {
        startLineNumber: range.startLine,
        startColumn: 1,
        endLineNumber: range.endLine,
        endColumn: model.getLineMaxColumn(range.endLine),
      },
      options: {
        isWholeLine: true,
        glyphMarginClassName: 'modified-line-gutter',
        className: 'modified-line-inline',
        overviewRuler: {
          color: 'rgba(14, 99, 156, 0.8)',
          position: monaco.editor.OverviewRulerLane.Left,
        },
      },
    }))
    decorationIdsRef.current = ed.deltaDecorations([], decorations)
    return () => {
      if (ed && decorationIdsRef.current.length > 0) {
        ed.deltaDecorations(decorationIdsRef.current, [])
        decorationIdsRef.current = []
      }
    }
  }, [file.path, diffRanges])

  useEffect(() => {
    return () => {
      editorRef.current = null
      onRegisterRef.current?.(() => null)
    }
  }, [])

  return (
    <div
      id="json-split-container"
      className="flex-1 flex overflow-hidden min-w-0"
    >
      {/* Left: JsonEditor */}
      <div
        className="h-full overflow-hidden border-r border-[#3e3e3e] flex flex-col"
        style={{ width: `${leftWidth}%`, minWidth: 0 }}
      >
        <div className="flex-1 min-h-0 overflow-hidden bg-[#1e1e1e]">
          <JsonEditor
            value={lastValidValue}
            onChange={handleJsonEditorChange}
            readOnly={false}
            height="100%"
            width="100%"
            className="h-full w-full"
            style={{
              '--vj-bg': '#1e1e1e',
              '--vj-text': '#d4d4d4',
              '--vj-border': '#3e3e3e',
              '--vj-accent': '#007acc',
              '--vj-font': '14px ui-monospace, monospace',
            } as React.CSSProperties}
          />
        </div>
      </div>

      {/* Resize handle */}
      <div
        role="separator"
        aria-label="Resize split"
        className="w-1 shrink-0 bg-[#252526] hover:bg-[#007acc] cursor-col-resize transition-colors"
        onMouseDown={() => {
          isDragging.current = true
          document.body.style.cursor = 'col-resize'
          document.body.style.userSelect = 'none'
        }}
      />

      {/* Right: Raw JSON code */}
      <div
        className="h-full overflow-hidden flex flex-col"
        style={{ width: `${100 - leftWidth}%`, minWidth: 0 }}
      >
        {parseError && (
          <div className="shrink-0 px-2 py-1 bg-amber-900/50 text-amber-200 text-xs border-b border-[#3e3e3e]">
            Invalid JSON: {parseError}
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-hidden">
          <Editor
            height="100%"
            language="json"
            value={codeContent}
            onChange={handleCodeChange}
            onMount={handleEditorDidMount}
            theme="vs-dark"
            options={{
              fontSize: 14,
              minimap: { enabled: true },
              wordWrap: 'on',
              automaticLayout: true,
              tabSize: 2,
              formatOnPaste: true,
              scrollBeyondLastLine: false,
              renderWhitespace: 'selection',
              cursorBlinking: 'smooth',
              readOnly: false,
              contextmenu: true,
              glyphMargin: true,
              overviewRulerLanes: 3,
            }}
            loading={
              <div className="flex items-center justify-center h-full text-gray-400">
                Loading editor...
              </div>
            }
          />
        </div>
      </div>
    </div>
  )
}
