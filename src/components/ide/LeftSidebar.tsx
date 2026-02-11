import { useState } from 'react'
import { Folder, RefreshCw, Network, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// Hardcoded recent projects for now
const recentProjects = [
  { name: 'Siemens_dashboard', path: 'D:\\' },
  { name: 'stack-guard', path: 'D:\\' },
  { name: 'regere-launchpad', path: 'D:\\' },
  { name: 'builder', path: 'D:\\' },
  { name: 'web_whisper', path: 'D:\\' },
]

interface LeftSidebarProps {
  expanded: boolean
  onToggle: () => void
  onOpenProject?: () => void
  onCloneRepo?: () => void
  onConnectSSH?: () => void
}

export function LeftSidebar({ 
  expanded, 
  onToggle, 
  onOpenProject,
  onCloneRepo,
  onConnectSSH
}: LeftSidebarProps) {
  const handleOpenProject = () => {
    console.log('Open project clicked')
    onOpenProject?.()
    // TODO: Implement project opening functionality
  }

  const handleCloneRepo = () => {
    console.log('Clone repo clicked')
    onCloneRepo?.()
    // TODO: Implement repo cloning functionality
  }

  const handleConnectSSH = () => {
    console.log('Connect via SSH clicked')
    onConnectSSH?.()
    // TODO: Implement SSH connection functionality
  }

  return (
    <div className={cn(
      "bg-[#252526] border-r border-[#3e3e3e] transition-all duration-200 flex flex-col",
      expanded ? "w-64" : "w-12"
    )}>
      {/* Action Buttons */}
      <div className="p-3 space-y-2 border-b border-[#3e3e3e]">
        <button
          onClick={handleOpenProject}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 hover:bg-[#2a2d2e] rounded transition-colors text-sm",
            !expanded && "justify-center"
          )}
          title="Open project"
        >
          <Folder className="w-4 h-4 flex-shrink-0" />
          {expanded && <span>Open project</span>}
        </button>
        <button
          onClick={handleCloneRepo}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 hover:bg-[#2a2d2e] rounded transition-colors text-sm",
            !expanded && "justify-center"
          )}
          title="Clone repo"
        >
          <RefreshCw className="w-4 h-4 flex-shrink-0" />
          {expanded && <span>Clone repo</span>}
        </button>
        <button
          onClick={handleConnectSSH}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 hover:bg-[#2a2d2e] rounded transition-colors text-sm",
            !expanded && "justify-center"
          )}
          title="Connect via SSH"
        >
          <Network className="w-4 h-4 flex-shrink-0" />
          {expanded && <span>Connect via SSH</span>}
        </button>
      </div>

      {/* Recent Projects Section */}
      {expanded && (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Recent projects
            </span>
            <button className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
              View all (36)
            </button>
          </div>
          <div className="space-y-1">
            {recentProjects.map((project, index) => (
              <button
                key={index}
                className="w-full text-left px-2 py-1.5 hover:bg-[#2a2d2e] rounded text-sm flex items-center gap-2 group"
              >
                <Folder className="w-4 h-4 text-gray-500 group-hover:text-gray-300" />
                <div className="flex-1 min-w-0">
                  <div className="text-gray-300 truncate">{project.name}</div>
                  <div className="text-xs text-gray-500 truncate">{project.path}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sidebar Toggle */}
      <div className="border-t border-[#3e3e3e] p-2">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center p-2 hover:bg-[#2a2d2e] rounded transition-colors"
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          <ChevronRight className={cn(
            "w-4 h-4 transition-transform",
            !expanded && "rotate-180"
          )} />
        </button>
      </div>
    </div>
  )
}
