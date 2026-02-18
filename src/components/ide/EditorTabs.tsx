import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface EditorFile {
  path: string
  name: string
  content: string
  isModified?: boolean
}

interface EditorTabsProps {
  files: EditorFile[]
  activeFile: EditorFile | null
  onFileSelect: (file: EditorFile) => void
  onFileClose: (file: EditorFile) => void
}

export function EditorTabs({ files, activeFile, onFileSelect, onFileClose }: EditorTabsProps) {
  if (files.length === 0) return null

  return (
    <div className="h-10 bg-[#252526] border-b border-[#3e3e3e] flex items-center overflow-x-auto custom-scrollbar">
      {files.map((file) => {
        const isActive = activeFile?.path === file.path
        return (
          <div
            key={file.path}
            className={cn(
              'flex items-center gap-2 px-3 h-full border-r border-[#3e3e3e] cursor-pointer hover:bg-[#2a2d2e] transition-colors min-w-fit',
              isActive && 'bg-[#1e1e1e]'
            )}
            onClick={() => onFileSelect(file)}
          >
            <span className="text-sm text-gray-300 whitespace-nowrap">
              {file.name}
              {file.isModified && <span className="ml-1 text-[#007acc]">●</span>}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onFileClose(file)
              }}
              className="p-0.5 hover:bg-[#3e3e3e] rounded transition-colors"
              title="Close file"
            >
              <X className="w-3 h-3 text-gray-400 hover:text-gray-300" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
