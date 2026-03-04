import { useEffect, useRef } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import type { editor } from 'monaco-editor'

// Configure @monaco-editor/react to use the locally installed monaco-editor
// This prevents it from loading loader.js from the CDN (which CSP blocks)
loader.config({ monaco })

interface File {
  path: string
  content: string
}

/** Selection from editor: file path, 1-based line range, and selected text. */
export interface EditorSelectionPayload {
  filePath: string
  startLine: number
  endLine: number
  text: string
}

export type GetEditorSelection = () => EditorSelectionPayload | null

export interface DiffRange {
  startLine: number
  endLine: number
}

interface EditorViewProps {
  file: File
  /** Line ranges of modified/added lines (from git diff) - shows gutter markers. */
  diffRanges?: DiffRange[]
  onChange?: (value: string) => void
  onSave?: () => void
  /** Called when editor mounts/unmounts so parent can get current selection (Monaco API). */
  onRegisterGetSelection?: (getSelection: GetEditorSelection) => void
}

export function EditorView({ file, diffRanges = [], onChange, onSave, onRegisterGetSelection }: EditorViewProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const filePathRef = useRef(file.path)
  filePathRef.current = file.path
  const onRegisterRef = useRef(onRegisterGetSelection)
  onRegisterRef.current = onRegisterGetSelection

  // Handle save keyboard shortcut (Ctrl+S / Cmd+S)
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
    return () => {
      window.removeEventListener('keydown', handleSave)
    }
  }, [onSave])

  const decorationIdsRef = useRef<string[]>([])

  // Apply diff decorations when editor model and diffRanges are ready
  useEffect(() => {
    const ed = editorRef.current
    if (!ed) return
    const model = ed.getModel()
    if (!model) return

    // Clear previous decorations
    if (decorationIdsRef.current.length > 0) {
      ed.deltaDecorations(decorationIdsRef.current, [])
      decorationIdsRef.current = []
    }

    if (diffRanges.length === 0) return

    const decorations: monaco.editor.IModelDeltaDecoration[] = diffRanges.map((range) => ({
      range: {
        startLineNumber: range.startLine,
        startColumn: 1,
        endLineNumber: range.endLine,
        endColumn: model.getLineMaxColumn(range.endLine),
      },
      options: {
        isWholeLine: true,
        // Left gutter marker (VS Code–style)
        glyphMarginClassName: 'modified-line-gutter',
        // Inline background highlight so changes are obvious in the working tree view
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

  // Clear getSelection when editor unmounts (e.g. switch to preview or close file)
  useEffect(() => {
    return () => {
      editorRef.current = null
      onRegisterRef.current?.(() => null)
    }
  }, [])

  // Auto-detect language from file extension
  const detectLanguage = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase()
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'json': 'json',
      'css': 'css',
      'html': 'html',
      'md': 'markdown',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'go': 'go',
      'rs': 'rust',
      'php': 'php',
      'rb': 'ruby',
      'swift': 'swift',
      'kt': 'kotlin',
      'sql': 'sql',
      'xml': 'xml',
      'yaml': 'yaml',
      'yml': 'yaml',
    }
    return languageMap[ext || ''] || 'plaintext'
  }

  return (
    <div className="flex-1 overflow-hidden">
      <Editor
        height="100%"
        language={detectLanguage(file.path)}
        value={file.content}
        onChange={(value) => onChange?.(value || '')}
        onMount={handleEditorDidMount}
        theme="vs-dark"
        options={{
          fontSize: 14,
          minimap: { enabled: true },
          wordWrap: 'on',
          automaticLayout: true,
          tabSize: 2,
          formatOnPaste: true,
          formatOnType: true,
          scrollBeyondLastLine: false,
          renderWhitespace: 'selection',
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          readOnly: false,
          contextmenu: true,
          glyphMargin: true,
          overviewRulerLanes: 3,
        }}
        loading={<div className="flex items-center justify-center h-full text-gray-400">Loading editor...</div>}
      />
    </div>
  )
}
