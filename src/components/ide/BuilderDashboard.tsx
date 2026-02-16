import { useState, useEffect } from 'react'
import { Folder } from 'lucide-react'
import { Button } from '../ui/button'
import { EditorView } from './EditorView'
import { EditorTabs, type EditorFile } from './EditorTabs'

interface BuilderDashboardProps {
  user: {
    firstName: string
    lastName: string
    email: string
  }
  activeProject?: any
  agentResponse?: any
}

export function BuilderDashboard({ user, activeProject, agentResponse }: BuilderDashboardProps) {
  const [openFiles, setOpenFiles] = useState<EditorFile[]>([])
  const [activeFile, setActiveFile] = useState<EditorFile | null>(null)

  const handleOpenProject = () => {
    console.log('Open project clicked')
    // TODO: Implement project opening functionality
  }

  const handleOpenFile = async () => {
    const electronAPI = window.electronAPI as any
    if (!electronAPI?.openFile) {
      console.error('Electron API not available')
      return
    }

    try {
      const result = await electronAPI.openFile()
      
      if (result.canceled || !result.success || !result.filePath || !result.content) {
        return
      }

      // Check if file is already open
      const existingFile = openFiles.find((f) => f.path === result.filePath)
      if (existingFile) {
        setActiveFile(existingFile)
        return
      }

      // Add new file
      const fileName = result.filePath.split(/[\\/]/).pop() || result.filePath
      const newFile: EditorFile = {
        path: result.filePath,
        name: fileName,
        content: result.content,
        isModified: false,
      }

      setOpenFiles((prev) => [...prev, newFile])
      setActiveFile(newFile)
    } catch (error) {
      console.error('Failed to open file:', error)
    }
  }

  const handleFileSelect = (file: EditorFile) => {
    setActiveFile(file)
  }

  const handleNewFile = () => {
    // Generate unique untitled file name
    let filePath = 'Untitled-1'
    let counter = 1
    
    // Check if untitled.ts exists, if so, try untitled-1.ts, untitled-2.ts, etc.
    while (openFiles.some((f) => f.path === filePath)) {
      counter++
      filePath = `Untitled-${counter}`
    }
    
    const fileName = filePath.split(/[\\/]/).pop() || filePath
    const newFile: EditorFile = {
      path: filePath,
      name: fileName,
      content: '',
      isModified: false,
    }
    
    setOpenFiles((prev) => [...prev, newFile])
    setActiveFile(newFile)
  }

  const handleFileClose = (file: EditorFile) => {
    setOpenFiles((prev) => prev.filter((f) => f.path !== file.path))
    
    // If closing active file, switch to another
    if (activeFile?.path === file.path) {
      const remaining = openFiles.filter((f) => f.path !== file.path)
      setActiveFile(remaining.length > 0 ? remaining[remaining.length - 1] : null)
    }
  }

  const handleFileChange = (value: string) => {
    if (!activeFile) return

    setOpenFiles((prev) =>
      prev.map((f) =>
        f.path === activeFile.path
          ? { ...f, content: value, isModified: true }
          : f
      )
    )
    setActiveFile((prev) =>
      prev ? { ...prev, content: value, isModified: true } : null
    )
  }

  const handleSave = async () => {
    if (!activeFile) return
    
    const electronAPI = window.electronAPI as any
    if (!electronAPI?.saveFile) return

    try {
      const result = await electronAPI.saveFile(
        activeFile.content,
        activeFile.path
      )

      if (result.success && result.filePath) {
        // Update file path if it changed (e.g., new file saved with name)
        const updatedPath = result.filePath
        const updatedName = updatedPath.split(/[\\/]/).pop() || updatedPath

        setOpenFiles((prev) =>
          prev.map((f) =>
            f.path === activeFile.path
              ? { ...f, path: updatedPath, name: updatedName, isModified: false }
              : f
          )
        )
        setActiveFile((prev) =>
          prev
            ? { ...prev, path: updatedPath, name: updatedName, isModified: false }
            : null
        )
      }
    } catch (error) {
      console.error('Failed to save file:', error)
    }
  }

  // Handle menu events (File → New, File → Open, File → Save)
  useEffect(() => {
    const electronAPI = window.electronAPI as any
    if (!electronAPI) return

    // Handle File → New menu
    if (electronAPI.onMenuNewFile) {
      electronAPI.onMenuNewFile(() => {
        handleNewFile()
      })
    }

    // Handle File → Open menu
    if (electronAPI.onMenuOpenRequested) {
      electronAPI.onMenuOpenRequested(() => {
        handleOpenFile()
      })
    }

    // Handle File → Save menu
    if (electronAPI.onMenuSaveRequested) {
      electronAPI.onMenuSaveRequested(() => {
        handleSave()
      })
    }

    // Cleanup on unmount
    return () => {
      if (electronAPI?.removeMenuListeners) {
        electronAPI.removeMenuListeners()
      }
    }
  }, [activeFile, openFiles])

  // Handle agent responses - open files from agent
  useEffect(() => {
    if (!agentResponse) return

    // If agent response contains code to create/edit files
    if (agentResponse.type === 'code' && agentResponse.content?.code) {
      const filePath = agentResponse.content.filePath || 'untitled.ts'
      const fileName = filePath.split(/[\\/]/).pop() || filePath
      
      const newFile: EditorFile = {
        path: filePath,
        name: fileName,
        content: agentResponse.content.code,
        isModified: true,
      }

      // Check if file already exists
      const existing = openFiles.find((f) => f.path === filePath)
      if (existing) {
        // Update existing file
        setOpenFiles((prev) =>
          prev.map((f) =>
            f.path === filePath ? { ...f, content: agentResponse.content.code, isModified: true } : f
          )
        )
        setActiveFile(existing)
      } else {
        // Add new file
        setOpenFiles((prev) => [...prev, newFile])
        setActiveFile(newFile)
      }
    }
  }, [agentResponse])

  return (
    <div className="flex-1 bg-[#1e1e1e] flex flex-col overflow-hidden">
      {/* Editor Tabs */}
      {openFiles.length > 0 && (
        <EditorTabs
          files={openFiles}
          activeFile={activeFile}
          onFileSelect={handleFileSelect}
          onFileClose={handleFileClose}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {agentResponse && agentResponse.type !== 'code' ? (
          // TODO: Render other agent response types
          <div className="flex-1 flex items-center justify-center p-8 text-gray-300">
            Agent Response Viewer (to be implemented)
          </div>
        ) : activeFile ? (
          <EditorView
            file={activeFile}
            onChange={handleFileChange}
            onSave={handleSave}
          />
        ) : activeProject ? (
          <div className="flex-1 flex items-center justify-center p-8 text-gray-300">
            Project loaded. Open a file from the sidebar or File menu.
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center space-y-4 max-w-md">
              <div className="text-6xl mb-4">👋</div>
              <h2 className="text-2xl font-semibold text-gray-200">
                Welcome to Builder, {user.firstName}!
              </h2>
              <p className="text-gray-400">
                Get started by opening a project or file.
              </p>
              <div className="pt-4 flex gap-3 justify-center">
                <Button
                  onClick={handleOpenProject}
                  variant="outline"
                  className="bg-[#2d2d2d] border-[#3e3e3e] text-gray-300 hover:bg-[#3e3e3e]"
                >
                  <Folder className="w-4 h-4 mr-2" />
                  Open Project
                </Button>
                <Button
                  onClick={handleOpenFile}
                  variant="outline"
                  className="bg-[#2d2d2d] border-[#3e3e3e] text-gray-300 hover:bg-[#3e3e3e]"
                >
                  <Folder className="w-4 h-4 mr-2" />
                  Open File
                </Button>
              </div>
              <div className="text-gray-400 text-sm flex flex-col justify-center gap-3">
               <span>Open chat  <span className="text-gray-400 bg-gray-800 px-2 py-1 rounded-md font-bold text-sm">Ctrl + K</span></span>
               <span>Hide Files  <span className="text-gray-400 bg-gray-800 px-2 py-1 rounded-md font-bold text-sm">Ctrl + B</span></span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
