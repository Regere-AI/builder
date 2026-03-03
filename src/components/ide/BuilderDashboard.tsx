import { useState, useEffect, useRef } from 'react'
import { Folder, Code, Layout } from 'lucide-react'
import { Button } from '../ui/button'
import { EditorView } from './EditorView'
import { JsonSplitView } from './JsonSplitView'
import { EditorTabs, type EditorFile } from './EditorTabs'
import { BuilderSettingsView } from './BuilderSettingsView'
import type { Spec } from '@json-render/core'
import { Renderer, StateProvider, VisibilityProvider, ActionProvider } from '@json-render/react'
import { registry } from '@/lib/json-render/registry'
import { parseToSpec, isJsonRenderSpec } from '@/lib/json-render/layout-to-spec'

export const SETTINGS_TAB_PATH = 'builder://settings'
import { openFile as desktopOpenFile, saveFile as desktopSaveFile, appWriteTextFile, isTauri, gitDiffFile, gitShowFile } from '@/desktop'
import type { ActiveApp } from './IDELayout'
import type { AgentResponsePayload } from './ChatPanel'
import type { GetEditorSelection, EditorSelectionPayload } from './EditorView'
import { GitDiffView } from './GitDiffView'

function parseLayoutOrSpec(content: string): ReturnType<typeof parseToSpec> {
  return parseToSpec(content)
}
import { Menu, Submenu, MenuItem, PredefinedMenuItem, CheckMenuItem } from '@tauri-apps/api/menu'
import { listen } from '@tauri-apps/api/event'
import { exit } from '@tauri-apps/plugin-process'

interface BuilderDashboardProps {
  user: {
    firstName: string
    lastName: string
    email: string
  }
  activeProject?: unknown
  activeApp?: ActiveApp | null
  registerOpenFileFromSidebar?: (handler: (path: string, content: string, options?: { fromGit?: boolean }) => void) => void
  registerFilesDeletedFromSidebar?: (handler: (paths: string[]) => void) => void
  onAppFilesChanged?: () => void
  onAgentResponseProcessed?: () => void
  agentResponse?: AgentResponsePayload
  /** When user adds selection to chat (e.g. Ctrl+L), open panel and set context. */
  onAddSelectionToChat?: (payload: EditorSelectionPayload) => void
  /** Incremented when files change on disk (notify watcher) so we can refresh git diff. */
  fileChangeTrigger?: number
}

export function BuilderDashboard({
  user,
  activeProject,
  activeApp,
  registerOpenFileFromSidebar,
  registerFilesDeletedFromSidebar,
  onAppFilesChanged,
  onAgentResponseProcessed,
  agentResponse,
  onAddSelectionToChat,
  fileChangeTrigger,
}: BuilderDashboardProps) {
  const AUTO_SAVE_KEY = 'builder-auto-save'
  const [openFiles, setOpenFiles] = useState<EditorFile[]>([])
  const [activeFile, setActiveFile] = useState<EditorFile | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [autoSave, setAutoSave] = useState(() => {
    try {
      const stored = localStorage.getItem(AUTO_SAVE_KEY)
      return stored === null ? true : stored === 'true'
    } catch {
      return false
    }
  })
  const openFilesRef = useRef<EditorFile[]>([])
  openFilesRef.current = openFiles
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingAutoSaveRef = useRef<{ path: string; content: string } | null>(null)
  const getEditorSelectionRef = useRef<GetEditorSelection>(() => null)
  const onAddSelectionToChatRef = useRef(onAddSelectionToChat)
  onAddSelectionToChatRef.current = onAddSelectionToChat
  const [diffRanges, setDiffRanges] = useState<{ startLine: number; endLine: number }[]>([])

  // Fetch git diff for modified lines when opening a file (Tauri only)
  useEffect(() => {
    if (!activeFile || !activeApp?.rootPath || !isTauri()) {
      setDiffRanges([])
      return
    }
    let cancelled = false
    gitDiffFile(activeApp.rootPath, activeFile.path)
      .then((ranges) => {
        if (!cancelled) setDiffRanges(ranges)
      })
      .catch(() => {
        if (!cancelled) setDiffRanges([])
      })
    return () => {
      cancelled = true
    }
  }, [activeFile?.path, activeApp?.rootPath, fileChangeTrigger])

  useEffect(() => {
    if (!registerOpenFileFromSidebar) return
    const handler = async (path: string, content: string, options?: { fromGit?: boolean }) => {
      if (path == null || typeof path !== 'string') return
      const source: 'normal' | 'git' = options?.fromGit ? 'git' : 'normal'
      const existing = openFilesRef.current.find(
        (f) => f.path === path && (f.source ?? 'normal') === source
      )
      if (existing) {
        setActiveFile(existing)
        return
      }
      const baseName = path.split(/[\\/]/).pop() || path
      const displayName = source === 'git' ? `${baseName} (Working Tree)` : baseName
      let originalContent: string | undefined
      if (source === 'git' && activeApp?.rootPath && isTauri()) {
        try {
          originalContent = await gitShowFile(activeApp.rootPath, path)
        } catch {
          originalContent = ''
        }
      }
      const newFile: EditorFile = {
        path,
        name: baseName,
        displayName,
        source,
        originalContent,
        content,
        isModified: false,
      }
      setOpenFiles((prev) => [...prev, newFile])
      setActiveFile(newFile)
    }
    registerOpenFileFromSidebar(handler)
    return () => registerOpenFileFromSidebar(() => {})
  }, [registerOpenFileFromSidebar])

  // Clear auto-save timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current)
    }
  }, [])

  // Close tabs when files/folders are deleted from the sidebar
  useEffect(() => {
    if (!registerFilesDeletedFromSidebar) return
    const handler = (paths: string[]) => {
      if (!Array.isArray(paths) || paths.length === 0) return
      const isDeletedPath = (filePath: string) =>
        paths.some((p) => filePath === p || filePath.startsWith(p.endsWith('/') ? p : `${p}/`))

      setOpenFiles((prev) => prev.filter((f) => !isDeletedPath(f.path)))

      setActiveFile((prev) => {
        if (!prev) return prev
        if (!isDeletedPath(prev.path)) return prev
        const remaining = openFilesRef.current.filter((f) => !isDeletedPath(f.path))
        return remaining.length > 0 ? remaining[remaining.length - 1] : null
      })
    }
    registerFilesDeletedFromSidebar(handler)
    return () => registerFilesDeletedFromSidebar(() => {})
  }, [registerFilesDeletedFromSidebar])

  // Tauri: handle app:add-selection-to-chat (Ctrl+L / Cmd+L global shortcut)
  useEffect(() => {
    if (!isTauri() || !onAddSelectionToChat) return
    let unlisten: (() => void) | undefined
    listen('app:add-selection-to-chat', () => {
      let payload = getEditorSelectionRef.current()
      if (!payload) {
        const docText = window.getSelection()?.toString()?.trim() ?? ''
        if (docText) payload = { filePath: '', startLine: 0, endLine: 0, text: docText }
      }
      if (payload) onAddSelectionToChatRef.current?.(payload)
    }).then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  }, [onAddSelectionToChat])

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
      const existingFile = openFiles.find(
        (f) => f.path === result.filePath && (f.source ?? 'normal') === 'normal'
      )
      if (existingFile) {
        setActiveFile(existingFile)
        return
      }
      const fileName = result.filePath.split(/[\\/]/).pop() || result.filePath
      const newFile: EditorFile = {
        path: result.filePath,
        name: fileName,
        displayName: fileName,
        source: 'normal',
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
    while (openFiles.some((f) => f.path === filePath && (f.source ?? 'normal') === 'normal')) {
      counter++
      filePath = `Untitled-${counter}`
    }
    
    const fileName = filePath.split(/[\\/]/).pop() || filePath
    const newFile: EditorFile = {
      path: filePath,
      name: fileName,
      displayName: fileName,
      source: 'normal',
      content: '',
      isModified: false,
    }
    
    setOpenFiles((prev) => [...prev, newFile])
    setActiveFile(newFile)
  }

  const handleFileClose = (file: EditorFile) => {
    setOpenFiles((prev) =>
      prev.filter(
        (f) =>
          !(
            f.path === file.path &&
            (f.source ?? 'normal') === (file.source ?? 'normal') &&
            f.path !== SETTINGS_TAB_PATH
          )
      )
    )
    
    // If closing active file, switch to another
    if (
      activeFile?.path === file.path &&
      (activeFile.source ?? 'normal') === (file.source ?? 'normal')
    ) {
      const remaining = openFiles.filter(
        (f) =>
          !(
            f.path === file.path &&
            (f.source ?? 'normal') === (file.source ?? 'normal') &&
            f.path !== SETTINGS_TAB_PATH
          )
      )
      setActiveFile(remaining.length > 0 ? remaining[remaining.length - 1] : null)
    }
  }

  const handleOpenBuilderSettings = () => {
    const existing = openFiles.find(
      (f) => f.path === SETTINGS_TAB_PATH && (f.source ?? 'normal') === 'normal'
    )
    if (existing) {
      setActiveFile(existing)
      return
    }
    const settingsFile: EditorFile = {
      path: SETTINGS_TAB_PATH,
      name: 'Builder Settings',
      displayName: 'Builder Settings',
      source: 'normal',
      content: '',
      isModified: false,
    }
    setOpenFiles((prev) => [...prev, settingsFile])
    setActiveFile(settingsFile)
  }

  const handleFileChange = (value: string) => {
    if (!activeFile) return

    setOpenFiles((prev) =>
      prev.map((f) =>
        f.path === activeFile.path && (f.source ?? 'normal') === (activeFile.source ?? 'normal')
          ? { ...f, content: value, isModified: true }
          : f
      )
    )
    setActiveFile((prev) =>
      prev ? { ...prev, content: value, isModified: true } : null
    )

    // Auto-save: debounced write to disk when enabled (only for files with a real path).
    // Do not stage - modified files stay in Unstaged Changes.
    if (autoSave && isTauri() && (activeFile.path.includes('/') || activeFile.path.includes('\\'))) {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current)
      pendingAutoSaveRef.current = { path: activeFile.path, content: value }
      autoSaveTimeoutRef.current = setTimeout(async () => {
        const pending = pendingAutoSaveRef.current
        autoSaveTimeoutRef.current = null
        pendingAutoSaveRef.current = null
        if (!pending) return
        try {
          await appWriteTextFile(pending.path, pending.content)
          setOpenFiles((prev) =>
            prev.map((f) =>
              f.path === pending.path ? { ...f, isModified: false } : f
            )
          )
          setActiveFile((prev) =>
            prev?.path === pending.path ? { ...prev, isModified: false } : prev
          )
          onAppFilesChanged?.()
        } catch (e) {
          console.error('Auto-save failed:', e)
        }
      }, 800)
    }
  }

  const handleSave = async () => {
    if (!activeFile) return
    if (activeFile.path === SETTINGS_TAB_PATH) return
    if (!isTauri()) return
    const hasRealPath = activeFile.path.includes('/') || activeFile.path.includes('\\')
    if (hasRealPath) {
      try {
        await appWriteTextFile(activeFile.path, activeFile.content)
        setOpenFiles((prev) =>
          prev.map((f) =>
            f.path === activeFile.path ? { ...f, isModified: false } : f
          )
        )
        setActiveFile((prev) =>
          prev?.path === activeFile.path ? { ...prev, isModified: false } : prev
        )
        onAppFilesChanged?.()
      } catch (error) {
        console.error('Failed to save file:', error)
      }
    } else {
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
          onAppFilesChanged?.()
        }
      } catch (error) {
        console.error('Failed to save file:', error)
      }
    }
  }

  const handleSaveAs = async () => {
    if (!activeFile) return
    if (activeFile.path === SETTINGS_TAB_PATH) return
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
        onAppFilesChanged?.()
      }
    } catch (error) {
      console.error('Failed to save file:', error)
    }
  }

  const handlersRef = useRef({ handleNewFile, handleOpenFile, handleSave, handleSaveAs, handleOpenBuilderSettings })
  handlersRef.current = { handleNewFile, handleOpenFile, handleSave, handleSaveAs, handleOpenBuilderSettings }

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
      const autoSaveItem = await CheckMenuItem.new({
        id: 'auto-save',
        text: 'Auto Save',
        checked: autoSave,
        action: () => {
          setAutoSave((prev) => {
            const next = !prev
            try {
              localStorage.setItem(AUTO_SAVE_KEY, next ? 'true' : 'false')
            } catch {
              // ignore
            }
            return next
          })
        },
      })
      const builderSettingsItem = await MenuItem.new({
        id: 'builder-settings',
        text: 'Builder Settings',
        action: () => runOnce('builder-settings', () => handlersRef.current.handleOpenBuilderSettings()),
      })
      const quitItem = await MenuItem.new({
        id: 'quit',
        text: isMac ? 'Quit' : 'Exit',
        accelerator: isMac ? 'Cmd+Q' : 'Ctrl+Q',
        action: () => exit(0),
      })

      const fileSubmenu = await Submenu.new({
        text: 'File',
        items: [newItem, openItem, separator, saveItem, saveAsItem, separator, autoSaveItem, separator, builderSettingsItem, separator, quitItem],
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
  }, [autoSave])

  // Chat streams JSON → ChatPanel writes to uiConfigs/generated.json (Tauri) and sends { code, filePath, resolvedPath? }.
  // We open the file in the editor and optionally write (e.g. when ChatPanel already wrote, we still refresh sidebar).
  useEffect(() => {
    if (!agentResponse) return

    if (agentResponse.type === 'code' && agentResponse.content?.code) {
      const relativePath = agentResponse.content.filePath || 'untitled.ts'
      const pathJoin = (...parts: string[]) =>
        parts.filter(Boolean).join('/').replace(/\\/g, '/')
      // Use resolvedPath from ChatPanel when no app open (e.g. default builder-generated folder); else activeApp root
      const resolvedPath =
        agentResponse.content.resolvedPath ??
        (activeApp ? pathJoin(activeApp.rootPath, relativePath) : relativePath)
      const canWriteToDisk = isTauri() && (agentResponse.content.resolvedPath != null || activeApp != null)

      const writeAndOpen = async () => {
        if (canWriteToDisk) {
          try {
            await appWriteTextFile(resolvedPath, agentResponse.content.code)
            onAppFilesChanged?.()
          } catch (e) {
            console.error('Failed to write generated file:', e)
          }
        }
        const fileName = resolvedPath.split(/[\\/]/).pop() || resolvedPath
        const newFile: EditorFile = {
          path: resolvedPath,
          name: fileName,
          content: agentResponse.content.code,
          isModified: !canWriteToDisk,
        }
        const existing = openFilesRef.current.find((f) => f.path === resolvedPath)
        if (existing) {
          const updatedFile: EditorFile = {
            ...existing,
            content: agentResponse.content.code,
            isModified: !canWriteToDisk,
          }
          setOpenFiles((prev) =>
            prev.map((f) => (f.path === resolvedPath ? updatedFile : f))
          )
          setActiveFile(updatedFile)
        } else {
          setOpenFiles((prev) => [...prev, newFile])
          setActiveFile(newFile)
        }
        // Show the UI preview when opening generated.json from agent so the rendering tree is visible
        if (relativePath === 'uiConfigs/generated.json') setShowPreview(true)
        onAgentResponseProcessed?.()
      }
      writeAndOpen()
    }
  }, [agentResponse, activeApp, onAppFilesChanged, onAgentResponseProcessed])

  // Reset preview when switching to a non-JSON file
  useEffect(() => {
    const isJson = activeFile?.path?.toLowerCase().endsWith('.json')
    if (!isJson) setShowPreview(false)
  }, [activeFile?.path])

  const isJsonFile = activeFile?.path?.toLowerCase().endsWith('.json')
  const layoutSpecFromFile = activeFile && isJsonFile ? parseLayoutOrSpec(activeFile.content) : null
  // When agent just returned code for generated.json, use that spec so the UI tree renders even before file is focused
  const generatedSpecFromAgent =
    agentResponse?.type === 'code' &&
    agentResponse.content?.filePath === 'uiConfigs/generated.json' &&
    agentResponse.content?.code
      ? (() => {
          try {
            const parsed = JSON.parse(agentResponse.content.code) as unknown
            return isJsonRenderSpec(parsed) ? parsed : null
          } catch {
            return parseToSpec(agentResponse.content.code)
          }
        })()
      : null
  const layoutSpec = layoutSpecFromFile ?? generatedSpecFromAgent
  const isGeneratedJson = agentResponse?.content?.filePath === 'uiConfigs/generated.json'
  const showLayoutPreview =
    !!layoutSpec &&
    (showPreview && isJsonFile ? true : agentResponse?.type === 'code' && !!isGeneratedJson)

  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')
  const configShortcut = isMac ? '⌘1' : 'Ctrl+1'
  const previewShortcut = isMac ? '⌘2' : 'Ctrl+2'

  // Cmd+1 / Ctrl+1 → Configuration, Cmd+2 / Ctrl+2 → Preview (when JSON file is active)
  useEffect(() => {
    if (!activeFile || !isJsonFile) return
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod || e.altKey || e.shiftKey) return
      if (e.key === '1') {
        e.preventDefault()
        setShowPreview(false)
      } else if (e.key === '2') {
        e.preventDefault()
        setShowPreview(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeFile, isJsonFile])

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
            title={`Configuration (${configShortcut})`}
          >
            <Code className="w-4 h-4 mr-1" />
            Configuration
            <span className="ml-1.5 opacity-60 text-xs font-normal">{configShortcut}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`text-sm ${showPreview ? 'bg-[#3e3e3e] text-white' : 'text-gray-400 hover:text-gray-200'}`}
            onClick={() => setShowPreview(true)}
            title={`Preview (${previewShortcut})`}
          >
            <Layout className="w-4 h-4 mr-1" />
            Preview
            <span className="ml-1.5 opacity-60 text-xs font-normal">{previewShortcut}</span>
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
        ) : activeFile?.path === SETTINGS_TAB_PATH ? (
          <BuilderSettingsView user={user} />
        ) : activeFile ? (
          showLayoutPreview ? (
            <div className="flex-1 overflow-auto p-6 bg-[#1e1e1e]">
              <div className="min-h-full rounded-md border border-[#3e3e3e] bg-[#2d2d2d] p-4">
                <StateProvider initialState={{}}>
                  <VisibilityProvider>
                    <ActionProvider handlers={{}}>
                      <Renderer spec={layoutSpec as Spec} registry={registry} />
                    </ActionProvider>
                  </VisibilityProvider>
                </StateProvider>
              </div>
            </div>
          ) : layoutSpec === null && showPreview && isJsonFile ? (
            <div className="flex-1 flex items-center justify-center p-8 text-gray-400">
              Invalid layout JSON. Ensure the file has a root object with a <code className="bg-[#3e3e3e] px-1 rounded">type</code> field.
            </div>
          ) : activeFile.source === 'git' ? (
            <GitDiffView file={activeFile} />
          ) : isJsonFile ? (
            <JsonSplitView
              file={activeFile}
              diffRanges={[]}
              onChange={handleFileChange}
              onSave={handleSave}
              onRegisterGetSelection={(getter) => {
                getEditorSelectionRef.current = getter
              }}
            />
          ) : (
            <EditorView
              file={activeFile}
              diffRanges={[]}
              onChange={handleFileChange}
              onSave={handleSave}
              onRegisterGetSelection={(getter) => {
                getEditorSelectionRef.current = getter
              }}
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
