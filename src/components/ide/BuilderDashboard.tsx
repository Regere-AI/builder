import { useState, useEffect, useRef } from 'react'
import { Folder } from 'lucide-react'
import { Button } from '../ui/button'
import { EditorView } from './EditorView'
import { EditorTabs, type EditorFile } from './EditorTabs'
import { openFile as desktopOpenFile, saveFile as desktopSaveFile, isTauri } from '@/desktop'
import { Menu, Submenu, MenuItem, PredefinedMenuItem } from '@tauri-apps/api/menu'
import { exit } from '@tauri-apps/plugin-process'

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
    if (!isTauri()) {
      console.error('Desktop API not available')
      return
    }
    try {
      const result = await desktopOpenFile()
      if (result.canceled || !result.success || !result.filePath || !result.content) {
        return
      }
      const existingFile = openFiles.find((f) => f.path === result.filePath)
      if (existingFile) {
        setActiveFile(existingFile)
        return
      }
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
    if (!isTauri()) return
    try {
      const result = await desktopSaveFile(activeFile.content, activeFile.path)
      if (result.success && result.filePath) {
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

  const handleSaveAs = async () => {
    if (!activeFile) return
    if (!isTauri()) return
    try {
      const result = await desktopSaveFile(activeFile.content)
      if (result.success && result.filePath) {
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

  const handlersRef = useRef({ handleNewFile, handleOpenFile, handleSave, handleSaveAs })
  handlersRef.current = { handleNewFile, handleOpenFile, handleSave, handleSaveAs }

  // Build Tauri app menu (File, Edit, View, Window, Help)
  useEffect(() => {
    if (!isTauri()) return
    let mounted = true
    const setupMenu = async () => {
      const isMac = navigator.platform.toLowerCase().includes('mac')

      const newItem = await MenuItem.new({
        id: 'new',
        text: 'New',
        accelerator: 'CmdOrCtrl+N',
        action: () => handlersRef.current.handleNewFile(),
      })
      const openItem = await MenuItem.new({
        id: 'open',
        text: 'Open',
        accelerator: 'CmdOrCtrl+O',
        action: () => handlersRef.current.handleOpenFile(),
      })
      const saveItem = await MenuItem.new({
        id: 'save',
        text: 'Save',
        accelerator: 'CmdOrCtrl+S',
        action: () => handlersRef.current.handleSave(),
      })
      const saveAsItem = await MenuItem.new({
        id: 'save-as',
        text: 'Save As...',
        accelerator: 'CmdOrCtrl+Shift+S',
        action: () => handlersRef.current.handleSaveAs(),
      })
      const separator = await PredefinedMenuItem.new({ item: 'Separator' })
      const quitItem = await MenuItem.new({
        id: 'quit',
        text: isMac ? 'Quit' : 'Exit',
        accelerator: isMac ? 'Cmd+Q' : 'Ctrl+Q',
        action: () => exit(0),
      })

      const fileSubmenu = await Submenu.new({
        text: 'File',
        items: [newItem, openItem, separator, saveItem, saveAsItem, separator, quitItem],
      })

      const undoItem = await PredefinedMenuItem.new({ item: 'Undo' })
      const redoItem = await PredefinedMenuItem.new({ item: 'Redo' })
      const editSep1 = await PredefinedMenuItem.new({ item: 'Separator' })
      const cutItem = await PredefinedMenuItem.new({ item: 'Cut' })
      const copyItem = await PredefinedMenuItem.new({ item: 'Copy' })
      const pasteItem = await PredefinedMenuItem.new({ item: 'Paste' })
      const selectAllItem = await PredefinedMenuItem.new({ item: 'SelectAll' })
      const editSep2 = await PredefinedMenuItem.new({ item: 'Separator' })
      const deleteItem = await PredefinedMenuItem.new({ item: 'Delete' })
      const editSubmenu = await Submenu.new({
        text: 'Edit',
        items: [undoItem, redoItem, editSep1, cutItem, copyItem, pasteItem, selectAllItem, editSep2, deleteItem],
      })

      const reloadItem = await PredefinedMenuItem.new({ item: 'Reload' })
      const devToolsItem = await PredefinedMenuItem.new({ item: 'ToggleDevTools' })
      const sep3 = await PredefinedMenuItem.new({ item: 'Separator' })
      const zoomInItem = await PredefinedMenuItem.new({ item: 'ZoomIn' })
      const zoomOutItem = await PredefinedMenuItem.new({ item: 'ZoomOut' })
      const resetZoomItem = await PredefinedMenuItem.new({ item: 'ResetZoom' })
      const fullscreenItem = await PredefinedMenuItem.new({ item: 'ToggleFullscreen' })
      const viewSubmenu = await Submenu.new({
        text: 'View',
        items: [reloadItem, devToolsItem, sep3, resetZoomItem, zoomInItem, zoomOutItem, sep3, fullscreenItem],
      })

      const minimizeItem = await PredefinedMenuItem.new({ item: 'Minimize' })
      const closeItem = await PredefinedMenuItem.new({ item: 'Close' })
      const windowSubmenu = await Submenu.new({
        text: 'Window',
        items: [minimizeItem, closeItem],
      })

      const aboutItem = await MenuItem.new({
        id: 'about',
        text: 'About',
        action: () => {
          // Could use @tauri-apps/plugin-dialog message() here
          console.log('Builder 1.0.0')
        },
      })
      const helpSubmenu = await Submenu.new({
        text: 'Help',
        items: [aboutItem],
      })

      const items = isMac ? [fileSubmenu, editSubmenu, viewSubmenu, windowSubmenu, helpSubmenu] : [fileSubmenu, editSubmenu, viewSubmenu, windowSubmenu, helpSubmenu]
      const menu = await Menu.new({ items })
      if (mounted) await menu.setAsAppMenu()
    }
    setupMenu()
    return () => {
      mounted = false
    }
  }, [])

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
