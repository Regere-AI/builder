import { useState, useEffect } from 'react'
import { LeftSidebar } from './LeftSidebar'
import { BuilderDashboard } from './BuilderDashboard'
import { ChatPanel } from './ChatPanel'
import { StatusBar } from './StatusBar'

interface User {
  firstName: string
  lastName: string
  email: string
}

interface IDELayoutProps {
  user: User
  agentResponse?: any
  activeProject?: any
  onLogout: () => void
}

export function IDELayout({ user, onLogout, agentResponse, activeProject }: IDELayoutProps) {
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [chatPanelOpen, setChatPanelOpen] = useState(false)
  const [chatPanelWidth, setChatPanelWidth] = useState(320)

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
        />

        {/* Center Content - BuilderDashboard */}
        <BuilderDashboard user={user} agentResponse={agentResponse} activeProject={activeProject} />

        {/* Right Chat Panel */}
        <ChatPanel 
          isOpen={chatPanelOpen} 
          onClose={() => setChatPanelOpen(false)}
          width={chatPanelWidth}
          onWidthChange={setChatPanelWidth}
        />
      </div>

      {/* Status Bar */}
      <StatusBar onLogout={onLogout} />
    </div>
  )
}
