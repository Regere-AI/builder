import { useState, useEffect, useRef, useCallback } from 'react'
import { LeftSidebar } from './LeftSidebar'
import { BuilderDashboard } from './BuilderDashboard'
import { ChatPanel, type AgentResponsePayload } from './ChatPanel'
import type { EditorSelectionPayload } from './EditorView'
import { StatusBar } from './StatusBar'
import type { LaunchpadConfig } from '@/services/api'
import { isTauri, watchDirectory, stopWatching, listenFileChanged } from '@/desktop'

interface User {
  firstName: string
  lastName: string
  email: string
}

export interface ActiveApp {
  rootPath: string
  name: string
}

interface IDELayoutProps {
  user: User
  activeProject?: unknown
  activeApp: ActiveApp | null
  onOpenApp: (app: ActiveApp | null) => void
  onCloseApp: () => void
  selectedLaunchpad?: LaunchpadConfig | null
  onSwitchLaunchpad: () => void
}

export function IDELayout({ user, activeProject, activeApp, onOpenApp, onCloseApp, selectedLaunchpad, onSwitchLaunchpad }: IDELayoutProps) {
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [sidebarView, setSidebarView] = useState<'files' | 'git'>('files')
  const [chatPanelOpen, setChatPanelOpen] = useState(false)
  const [chatPanelWidth, setChatPanelWidth] = useState(320)
  const [pendingChatContext, setPendingChatContext] = useState<EditorSelectionPayload | null>(null)
  const [agentResponse, setAgentResponse] = useState<AgentResponsePayload | undefined>(undefined)
  const [sidebarRefreshTrigger, setSidebarRefreshTrigger] = useState(0)
  const [fileChangeTrigger, setFileChangeTrigger] = useState(0)
  const [reloadOpenFilesTrigger, setReloadOpenFilesTrigger] = useState(0)

  const handleGitAffectedFiles = useCallback(() => {
    setReloadOpenFilesTrigger((n) => n + 1)
    setSidebarRefreshTrigger((n) => n + 1)
    setFileChangeTrigger((n) => n + 1)
  }, [])
  const openFileFromSidebarHandlerRef = useRef<((path: string, content: string, options?: { fromGit?: boolean }) => void) | null>(null)
  const filesDeletedFromSidebarHandlerRef = useRef<((paths: string[]) => void) | null>(null)
  const fileChangeUnlistenRef = useRef<null | (() => void)>(null)
  const handleOpenFileFromSidebar = useCallback((path: string, content: string, options?: { fromGit?: boolean }) => {
    openFileFromSidebarHandlerRef.current?.(path, content, options)
  }, [])
  const handleFilesDeletedFromSidebar = useCallback((paths: string[]) => {
    filesDeletedFromSidebarHandlerRef.current?.(paths)
  }, [])
  const handleAddSelectionToChat = useCallback((payload: EditorSelectionPayload) => {
    setChatPanelOpen(true)
    setPendingChatContext(payload)
  }, [])
  const handleConsumePendingContext = useCallback(() => setPendingChatContext(null), [])

  // Keyboard shortcut handler for chat panel (Ctrl+L / Cmd+L)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl+L (Windows/Linux) or Cmd+L (Mac)
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modifierKey = isMac ? e.metaKey : e.ctrlKey
      
      if (modifierKey && ( e.key === 'k' || e.key === 'K' )) {
        e.preventDefault()
        setChatPanelOpen((prev) => !prev)
      }

      if (modifierKey && ( e.key === 'b' || e.key === 'B' )) {
        e.preventDefault()
        setSidebarExpanded((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Watch the active app folder for file changes (via Tauri notify watcher).
  // When files change, refresh sidebar (files + Git panel) and diff markers in editor.
  useEffect(() => {
    if (!isTauri()) return

    let cancelled = false

    const startWatching = async () => {
      try {
        // Stop any existing watcher
        if (fileChangeUnlistenRef.current) {
          fileChangeUnlistenRef.current()
          fileChangeUnlistenRef.current = null
        }
        if (!activeApp?.rootPath) {
          await stopWatching().catch(() => {})
          return
        }

        await watchDirectory(activeApp.rootPath)

        const unlisten = await listenFileChanged(({ payload }) => {
          if (cancelled) return
          if (!Array.isArray(payload) || payload.length === 0) return

          // Ignore pure .git internal changes (commits, pushes) so the Git panel
          // doesn't spam "Checking repository…" while Git writes its own metadata.
          const hasNonGitChange = payload.some((p) => {
            const lower = p.toLowerCase()
            return !lower.includes('\\.git\\') && !lower.includes('/.git/')
          })
          if (!hasNonGitChange) return

          // Trigger sidebar and Git panel refresh for real workspace file changes
          setSidebarRefreshTrigger((n) => n + 1)
          // Trigger diff refresh in BuilderDashboard
          setFileChangeTrigger((n) => n + 1)
        })

        if (cancelled) {
          unlisten()
        } else {
          fileChangeUnlistenRef.current = unlisten
        }
      } catch (e) {
        console.error('Failed to start file watcher', e)
      }
    }

    startWatching()

    return () => {
      cancelled = true
      if (fileChangeUnlistenRef.current) {
        fileChangeUnlistenRef.current()
        fileChangeUnlistenRef.current = null
      }
      stopWatching().catch(() => {})
    }
  }, [activeApp?.rootPath, setSidebarRefreshTrigger])

  return (
    <div className="w-screen h-screen bg-[#1e1e1e] flex flex-col text-gray-300 overflow-hidden">
      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar with activity bar */}
        <LeftSidebar
          expanded={sidebarExpanded}
          onToggle={() => setSidebarExpanded(!sidebarExpanded)}
          sidebarView={sidebarView}
          onSidebarViewChange={setSidebarView}
          activeApp={activeApp}
          onOpenApp={onOpenApp}
          onCloseApp={onCloseApp}
          onOpenFile={handleOpenFileFromSidebar}
          onDeletePaths={handleFilesDeletedFromSidebar}
          refreshTrigger={sidebarRefreshTrigger}
          onPullOrBranchChange={handleGitAffectedFiles}
          selectedLaunchpad={selectedLaunchpad}
        />

        {/* Center Content - BuilderDashboard */}
        <BuilderDashboard
          user={user}
          agentResponse={agentResponse}
          activeProject={activeProject}
          activeApp={activeApp}
          registerOpenFileFromSidebar={(handler) => { openFileFromSidebarHandlerRef.current = handler }}
          registerFilesDeletedFromSidebar={(handler) => { filesDeletedFromSidebarHandlerRef.current = handler }}
          onAppFilesChanged={() => setSidebarRefreshTrigger((n) => n + 1)}
          onAgentResponseProcessed={() => setAgentResponse(undefined)}
          onAddSelectionToChat={handleAddSelectionToChat}
          fileChangeTrigger={fileChangeTrigger}
          reloadOpenFilesTrigger={reloadOpenFilesTrigger}
        />

        {/* Right Chat Panel */}
        <ChatPanel 
          isOpen={chatPanelOpen} 
          onClose={() => setChatPanelOpen(false)}
          width={chatPanelWidth}
          onWidthChange={setChatPanelWidth}
          onAgentResponse={setAgentResponse}
          appRootPath={activeApp?.rootPath ?? null}
          pendingContext={pendingChatContext}
          onConsumePendingContext={handleConsumePendingContext}
        />
      </div>

      {/* Status Bar */}
      <StatusBar
        selectedLaunchpad={selectedLaunchpad}
        onSwitchLaunchpad={onSwitchLaunchpad}
        repoPath={activeApp?.rootPath ?? null}
        onBranchChanged={handleGitAffectedFiles}
      />
    </div>
  )
}
