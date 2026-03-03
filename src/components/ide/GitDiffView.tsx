import { useMemo } from 'react'
import { DiffEditor, loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import type { EditorFile } from './EditorTabs'

loader.config({ monaco })

interface GitDiffViewProps {
  file: EditorFile & { originalContent?: string }
}

function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    css: 'css',
    html: 'html',
    md: 'markdown',
    py: 'python',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    go: 'go',
    rs: 'rust',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    kt: 'kotlin',
    sql: 'sql',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
  }
  return languageMap[ext || ''] || 'plaintext'
}

export function GitDiffView({ file }: GitDiffViewProps) {
  const language = useMemo(() => detectLanguage(file.path), [file.path])

  return (
    <div className="flex-1 overflow-hidden">
      <DiffEditor
        height="100%"
        language={language}
        original={file.originalContent ?? ''}
        modified={file.content}
        theme="vs-dark"
        options={{
          fontSize: 14,
          minimap: { enabled: true },
          wordWrap: 'on',
          automaticLayout: true,
          tabSize: 2,
          renderSideBySide: true,
          scrollBeyondLastLine: false,
          renderIndicators: true,
          diffAlgorithm: 'advanced',
          originalEditable: false,
        }}
      />
    </div>
  )
}

