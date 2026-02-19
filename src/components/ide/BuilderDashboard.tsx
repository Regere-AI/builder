import { useState, useEffect, useRef } from 'react'
import { Folder, Code, Layout } from 'lucide-react'
import { Button } from '../ui/button'
import { EditorView } from './EditorView'
import { EditorTabs, type EditorFile } from './EditorTabs'
import { LayoutRenderer, defaultLayoutRegistry, type LayoutNode } from './LayoutRenderer'
import { openFile as desktopOpenFile, saveFile as desktopSaveFile, isTauri } from '@/desktop'

function parseLayoutJson(content: string): LayoutNode | null {
  try {
    const node = JSON.parse(content)
    if (node && typeof node === 'object' && node.type) return node as LayoutNode
    return null
  } catch {
    return null
  }
}
import { Menu, Submenu, MenuItem, PredefinedMenuItem } from '@tauri-apps/api/menu'
import { listen } from '@tauri-apps/api/event'
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
  const [showPreview, setShowPreview] = useState(false)

  const handleOpenProject = () => {
    console.log('Open project clicked')
    // TODO: Implement project opening functionality
  }

  const handleOpenFile = async () => {
    if (!isTauri()) {
      console.warn('Desktop API not available — run the app with "npm run tauri dev" to use Open File.')
      window.alert('Open File is only available in the desktop app.\n\nRun: npm run tauri dev')
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

  // Debounce menu/shortcut handlers so duplicate events (e.g. shortcut + menu) only run once
  const menuLastCallRef = useRef<Record<string, number>>({})
  const MENU_DEBOUNCE_MS = 400
  const runOnce = (key: string, fn: () => void) => {
    const now = Date.now()
    if (now - (menuLastCallRef.current[key] ?? 0) < MENU_DEBOUNCE_MS) return
    menuLastCallRef.current[key] = now
    fn()
  }

  // Subscribe to global shortcut events from backend (once; cleanup clears so no double-firing)
  const shortcutUnlistensRef = useRef<Array<() => void>>([])
  const effectIdRef = useRef(0)
  useEffect(() => {
    if (!isTauri()) return
    effectIdRef.current += 1
    const thisId = effectIdRef.current
    shortcutUnlistensRef.current.forEach((fn) => fn())
    shortcutUnlistensRef.current = []
    Promise.all([
      listen('menu:new-file', () => runOnce('new-file', () => handlersRef.current.handleNewFile())),
      listen('menu:open-file', () => runOnce('open-file', () => handlersRef.current.handleOpenFile())),
      listen('menu:save', () => runOnce('save', () => handlersRef.current.handleSave())),
      listen('menu:save-as', () => runOnce('save-as', () => handlersRef.current.handleSaveAs())),
    ]).then((unlistenFns) => {
      if (thisId !== effectIdRef.current) {
        unlistenFns.forEach((fn) => fn())
        return
      }
      shortcutUnlistensRef.current = unlistenFns
    })
    return () => {
      shortcutUnlistensRef.current.forEach((fn) => fn())
      shortcutUnlistensRef.current = []
    }
  }, [])

  // Build Tauri app menu (File, Edit, View, Window, Help + Selection, Go, Run, Terminal)
  useEffect(() => {
    if (!isTauri()) return
    let mounted = true
    const setupMenu = async () => {
      const isMac = navigator.platform.toLowerCase().includes('mac')

      // No accelerators on New/Open/Save/Save As: global shortcuts in lib.rs handle keys (emit menu:* events).
      // Menu actions use runOnce so shortcut+menu double-fire only runs once.
      const newItem = await MenuItem.new({
        id: 'new',
        text: 'New',
        action: () => runOnce('new-file', () => handlersRef.current.handleNewFile()),
      })
      const openItem = await MenuItem.new({
        id: 'open',
        text: 'Open',
        action: () => runOnce('open-file', () => handlersRef.current.handleOpenFile()),
      })
      const saveItem = await MenuItem.new({
        id: 'save',
        text: 'Save',
        action: () => runOnce('save', () => handlersRef.current.handleSave()),
      })
      const saveAsItem = await MenuItem.new({
        id: 'save-as',
        text: 'Save As...',
        action: () => runOnce('save-as', () => handlersRef.current.handleSaveAs()),
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
      const deleteItem = await MenuItem.new({
        id: 'delete',
        text: 'Delete',
        action: () => document.execCommand('delete', false),
      })
      const editSubmenu = await Submenu.new({
        text: 'Edit',
        items: [undoItem, redoItem, editSep1, cutItem, copyItem, pasteItem, selectAllItem, editSep2, deleteItem],
      })

      const selectionSelectAll = await PredefinedMenuItem.new({ item: 'SelectAll' })
      const selectionSubmenu = await Submenu.new({
        text: 'Selection',
        items: [selectionSelectAll],
      })

      const goToLineItem = await MenuItem.new({
        id: 'go-to-line',
        text: 'Go to Line...',
        accelerator: 'CmdOrCtrl+G',
        action: () => console.log('Go to Line'),
      })
      const goToFileItem = await MenuItem.new({
        id: 'go-to-file',
        text: 'Go to File...',
        accelerator: 'CmdOrCtrl+P',
        action: () => console.log('Go to File'),
      })
      const goSubmenu = await Submenu.new({
        text: 'Go',
        items: [goToLineItem, goToFileItem],
      })

      const runItem = await MenuItem.new({
        id: 'run',
        text: 'Run',
        accelerator: 'F5',
        action: () => console.log('Run'),
      })
      const debugItem = await MenuItem.new({
        id: 'debug',
        text: 'Debug',
        accelerator: 'F10',
        action: () => console.log('Debug'),
      })
      const runSubmenu = await Submenu.new({
        text: 'Run',
        items: [runItem, debugItem],
      })

      const newTerminalItem = await MenuItem.new({
        id: 'new-terminal',
        text: 'New Terminal',
        accelerator: 'Ctrl+`',
        action: () => console.log('New Terminal'),
      })
      const toggleTerminalItem = await MenuItem.new({
        id: 'toggle-terminal',
        text: 'Toggle Terminal',
        accelerator: 'Ctrl+`',
        action: () => console.log('Toggle Terminal'),
      })
      const terminalSubmenu = await Submenu.new({
        text: 'Terminal',
        items: [newTerminalItem, toggleTerminalItem],
      })

      const reloadItem = await MenuItem.new({
        id: 'reload',
        text: 'Reload',
        accelerator: 'CmdOrCtrl+R',
        action: () => window.location.reload(),
      })
      const devToolsItem = await MenuItem.new({
        id: 'toggle-devtools',
        text: 'Toggle Developer Tools',
        action: () => {
          // Tauri handles this via native menu; custom item for consistency
          console.log('Toggle DevTools')
        },
      })
      const sep3 = await PredefinedMenuItem.new({ item: 'Separator' })
      const zoomInItem = await MenuItem.new({
        id: 'zoom-in',
        text: 'Zoom In',
        accelerator: 'CmdOrCtrl+Plus',
        action: () => {},
      })
      const zoomOutItem = await MenuItem.new({
        id: 'zoom-out',
        text: 'Zoom Out',
        accelerator: 'CmdOrCtrl+-',
        action: () => {},
      })
      const resetZoomItem = await MenuItem.new({
        id: 'reset-zoom',
        text: 'Reset Zoom',
        accelerator: 'CmdOrCtrl+0',
        action: () => {},
      })
      const fullscreenItem = await PredefinedMenuItem.new({ item: 'Fullscreen' })
      const viewSubmenu = await Submenu.new({
        text: 'View',
        items: [reloadItem, devToolsItem, sep3, resetZoomItem, zoomInItem, zoomOutItem, sep3, fullscreenItem],
      })

      const minimizeItem = await PredefinedMenuItem.new({ item: 'Minimize' })
      const closeItem = await PredefinedMenuItem.new({ item: 'CloseWindow' })
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

      const items = isMac
        ? [fileSubmenu, editSubmenu, selectionSubmenu, viewSubmenu, goSubmenu, runSubmenu, terminalSubmenu, windowSubmenu, helpSubmenu]
        : [fileSubmenu, editSubmenu, selectionSubmenu, viewSubmenu, goSubmenu, runSubmenu, terminalSubmenu, windowSubmenu, helpSubmenu]
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
        const updatedFile: EditorFile = {
          ...existing,
          content: agentResponse.content.code,
          isModified: true,
        }
        setOpenFiles((prev) =>
          prev.map((f) =>
            f.path === filePath ? updatedFile : f
          )
        )
        setActiveFile(updatedFile)
      } else {
        // Add new file
        setOpenFiles((prev) => [...prev, newFile])
        setActiveFile(newFile)
      }
    }
  }, [agentResponse])

  // Reset preview when switching to a non-JSON file
  useEffect(() => {
    const isJson = activeFile?.path?.toLowerCase().endsWith('.json')
    if (!isJson) setShowPreview(false)
  }, [activeFile?.path])

  const isJsonFile = activeFile?.path?.toLowerCase().endsWith('.json')
  const layoutNode = activeFile && isJsonFile ? parseLayoutJson(activeFile.content) : null
  const showLayoutPreview = showPreview && isJsonFile && layoutNode

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

      {/* Code / Preview toolbar for JSON layout files */}
      {activeFile && isJsonFile && (
        <div className="h-9 bg-[#252526] border-b border-[#3e3e3e] flex items-center gap-1 px-2">
          <Button
            variant="ghost"
            size="sm"
            className={`text-sm ${!showPreview ? 'bg-[#3e3e3e] text-white' : 'text-gray-400 hover:text-gray-200'}`}
            onClick={() => setShowPreview(false)}
          >
            <Code className="w-4 h-4 mr-1" />
            Code
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`text-sm ${showPreview ? 'bg-[#3e3e3e] text-white' : 'text-gray-400 hover:text-gray-200'}`}
            onClick={() => setShowPreview(true)}
          >
            <Layout className="w-4 h-4 mr-1" />
            Preview
          </Button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {agentResponse && agentResponse.type !== 'code' ? (
          // TODO: Render other agent response types
          <div className="flex-1 flex items-center justify-center p-8 text-gray-300">
            Agent Response Viewer (to be implemented)
          </div>
        ) : activeFile ? (
          showLayoutPreview ? (
            <div className="flex-1 overflow-auto p-6 bg-[#1e1e1e]">
              <div className="min-h-full rounded-md border border-[#3e3e3e] bg-[#2d2d2d] p-4">
                <LayoutRenderer node={layoutNode!} registry={defaultLayoutRegistry} />
              </div>
            </div>
          ) : layoutNode === null && showPreview && isJsonFile ? (
            <div className="flex-1 flex items-center justify-center p-8 text-gray-400">
              Invalid layout JSON. Ensure the file has a root object with a <code className="bg-[#3e3e3e] px-1 rounded">type</code> field.
            </div>
          ) : (
            <EditorView
              file={activeFile}
              onChange={handleFileChange}
              onSave={handleSave}
            />
          )
        ) : activeProject ? (
          <div className="flex-1 flex items-center justify-center p-8 text-gray-300">
            Project loaded. Open a file from the sidebar or File menu.
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
            <div className="text-center space-y-6 max-w-2xl w-full">
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
