import { useState } from 'react'
import { Folder, RefreshCw, Network, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

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
}: LeftSidebarProps) {
  
  return (
    <div className={cn(
      "bg-[#252526] border-r border-[#3e3e3e] transition-all duration-200 flex flex-col",
      expanded ? "w-64" : "w-12"
    )}>
      {/* Action Buttons */}
      <div className="p-3 space-y-2 border-b border-[#3e3e3e]">
        {/*  */}
      </div>

      {/* Recent Projects Section */}
      {expanded && (
        <div className="flex-1 overflow-y-auto p-3">
        
          <div className="space-y-1">
           
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
