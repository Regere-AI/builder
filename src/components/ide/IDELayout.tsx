import { useState, useEffect, useRef, useCallback } from 'react'
import { LeftSidebar } from './LeftSidebar'
import { BuilderDashboard } from './BuilderDashboard'
import { ChatPanel, type AgentResponsePayload } from './ChatPanel'
import type { EditorSelectionPayload } from './EditorView'
import { StatusBar } from './StatusBar'
import type { LaunchpadConfig } from '@/services/api'

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
  onLogout: () => void
  onSwitchLaunchpad: () => void
}

export function IDELayout({ user, onLogout, activeProject, activeApp, onOpenApp, onCloseApp, selectedLaunchpad, onSwitchLaunchpad }: IDELayoutProps) {
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [chatPanelOpen, setChatPanelOpen] = useState(false)
  const [chatPanelWidth, setChatPanelWidth] = useState(320)
  const [pendingChatContext, setPendingChatContext] = useState<EditorSelectionPayload | null>(null)
  const [agentResponse, setAgentResponse] = useState<AgentResponsePayload | undefined>(undefined)
  const [sidebarRefreshTrigger, setSidebarRefreshTrigger] = useState(0)
  const openFileFromSidebarHandlerRef = useRef<((path: string, content: string) => void) | null>(null)
  const filesDeletedFromSidebarHandlerRef = useRef<((paths: string[]) => void) | null>(null)
  const handleOpenFileFromSidebar = useCallback((path: string, content: string) => {
    openFileFromSidebarHandlerRef.current?.(path, content)
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

  return (
    <div className="w-screen h-screen bg-[#1e1e1e] flex flex-col text-gray-300 overflow-hidden">
      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <LeftSidebar
          expanded={sidebarExpanded}
          onToggle={() => setSidebarExpanded(!sidebarExpanded)}
          activeApp={activeApp}
          onOpenApp={onOpenApp}
          onCloseApp={onCloseApp}
          onOpenFile={handleOpenFileFromSidebar}
          onDeletePaths={handleFilesDeletedFromSidebar}
          refreshTrigger={sidebarRefreshTrigger}
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
        />

        {/* Right Chat Panel */}
        <ChatPanel 
          isOpen={chatPanelOpen} 
          onClose={() => setChatPanelOpen(false)}
          width={chatPanelWidth}
          onWidthChange={setChatPanelWidth}
          onAgentResponse={setAgentResponse}
          pendingContext={pendingChatContext}
          onConsumePendingContext={handleConsumePendingContext}
        />
      </div>

      {/* Status Bar */}
      <StatusBar onLogout={onLogout} selectedLaunchpad={selectedLaunchpad} onSwitchLaunchpad={onSwitchLaunchpad} />
    </div>
  )
}
