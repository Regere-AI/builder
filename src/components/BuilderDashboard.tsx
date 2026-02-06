import { useState } from 'react'
import { 
  LogOut, 
  Folder, 
  RefreshCw, 
  Network, 
  Settings, 
  FileText, 
  Search, 
  ChevronRight,
  Rocket
} from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

interface BuilderDashboardProps {
  user: {
    firstName: string
    lastName: string
    email: string
  }
  onLogout: () => void
}

// Hardcoded recent projects for now
const recentProjects = [
  { name: 'Siemens_dashboard', path: 'D:\\' },
  { name: 'stack-guard', path: 'D:\\' },
  { name: 'regere-launchpad', path: 'D:\\' },
  { name: 'builder', path: 'D:\\' },
  { name: 'web_whisper', path: 'D:\\' },
]

export function BuilderDashboard({ user, onLogout }: BuilderDashboardProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [sidebarExpanded, setSidebarExpanded] = useState(true)

  const handleMenuClick = (menu: string) => {
    setActiveMenu(activeMenu === menu ? null : menu)
  }

  const handleOpenProject = () => {
    console.log('Open project clicked')
    // TODO: Implement project opening functionality
  }

  const handleCloneRepo = () => {
    console.log('Clone repo clicked')
    // TODO: Implement repo cloning functionality
  }

  const handleConnectSSH = () => {
    console.log('Connect via SSH clicked')
    // TODO: Implement SSH connection functionality
  }

  const handleFileNew = () => {
    console.log('New file/project')
    setActiveMenu(null)
  }

  const handleFileOpen = () => {
    console.log('Open file/project')
    handleOpenProject()
    setActiveMenu(null)
  }

  const handleViewSettings = () => {
    console.log('Open settings')
    setActiveMenu(null)
  }

  return (
    <div className="w-screen h-screen bg-[#1e1e1e] flex flex-col text-gray-300 overflow-hidden">
      {/* Menu Bar */}
      <div className="h-7 bg-[#2d2d2d] border-b border-[#3e3e3e] flex items-center px-2 text-xs font-medium">
        <button
          className={cn(
            "px-3 py-1 hover:bg-[#3e3e3e] rounded transition-colors",
            activeMenu === 'file' && "bg-[#3e3e3e]"
          )}
          onClick={() => handleMenuClick('file')}
        >
          File
        </button>
        <button
          className={cn(
            "px-3 py-1 hover:bg-[#3e3e3e] rounded transition-colors",
            activeMenu === 'edit' && "bg-[#3e3e3e]"
          )}
          onClick={() => handleMenuClick('edit')}
        >
          Edit
        </button>
        <button
          className={cn(
            "px-3 py-1 hover:bg-[#3e3e3e] rounded transition-colors",
            activeMenu === 'selection' && "bg-[#3e3e3e]"
          )}
          onClick={() => handleMenuClick('selection')}
        >
          Selection
        </button>
        <button
          className={cn(
            "px-3 py-1 hover:bg-[#3e3e3e] rounded transition-colors",
            activeMenu === 'view' && "bg-[#3e3e3e]"
          )}
          onClick={() => handleMenuClick('view')}
        >
          View
        </button>
        <button
          className={cn(
            "px-3 py-1 hover:bg-[#3e3e3e] rounded transition-colors",
            activeMenu === 'go' && "bg-[#3e3e3e]"
          )}
          onClick={() => handleMenuClick('go')}
        >
          Go
        </button>
        <button
          className={cn(
            "px-3 py-1 hover:bg-[#3e3e3e] rounded transition-colors",
            activeMenu === 'run' && "bg-[#3e3e3e]"
          )}
          onClick={() => handleMenuClick('run')}
        >
          Run
        </button>
        <button
          className={cn(
            "px-3 py-1 hover:bg-[#3e3e3e] rounded transition-colors",
            activeMenu === 'terminal' && "bg-[#3e3e3e]"
          )}
          onClick={() => handleMenuClick('terminal')}
        >
          Terminal
        </button>
        <button
          className={cn(
            "px-3 py-1 hover:bg-[#3e3e3e] rounded transition-colors",
            activeMenu === 'help' && "bg-[#3e3e3e]"
          )}
          onClick={() => handleMenuClick('help')}
        >
          Help
        </button>

        {/* Menu Dropdowns */}
        {activeMenu === 'file' && (
          <div className="absolute top-7 left-0 bg-[#2d2d2d] border border-[#3e3e3e] shadow-lg rounded-md mt-1 min-w-[180px] z-50">
            <button
              className="w-full text-left px-4 py-2 hover:bg-[#3e3e3e] text-sm flex items-center gap-2"
              onClick={handleFileNew}
            >
              <FileText className="w-4 h-4" />
              New File
            </button>
            <button
              className="w-full text-left px-4 py-2 hover:bg-[#3e3e3e] text-sm flex items-center gap-2"
              onClick={handleFileOpen}
            >
              <Folder className="w-4 h-4" />
              Open...
            </button>
            <div className="border-t border-[#3e3e3e] my-1" />
            <button
              className="w-full text-left px-4 py-2 hover:bg-[#3e3e3e] text-sm"
              onClick={() => setActiveMenu(null)}
            >
              Exit
            </button>
          </div>
        )}

        {activeMenu === 'view' && (
          <div className="absolute top-7 left-[200px] bg-[#2d2d2d] border border-[#3e3e3e] shadow-lg rounded-md mt-1 min-w-[180px] z-50">
            <button
              className="w-full text-left px-4 py-2 hover:bg-[#3e3e3e] text-sm flex items-center gap-2"
              onClick={handleViewSettings}
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
            <button
              className="w-full text-left px-4 py-2 hover:bg-[#3e3e3e] text-sm flex items-center gap-2"
              onClick={() => setActiveMenu(null)}
            >
              <Search className="w-4 h-4" />
              Search
            </button>
          </div>
        )}

        {/* Title Bar */}
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs text-gray-400">
            Builder [{user.firstName} {user.lastName}]
          </span>
        </div>

        {/* Window Controls (Visual Only) */}
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-[#3e3e3e] hover:bg-[#4e4e4e] cursor-pointer transition-colors" />
          <div className="w-3 h-3 rounded-full bg-[#3e3e3e] hover:bg-[#4e4e4e] cursor-pointer transition-colors" />
          <div className="w-3 h-3 rounded-full bg-[#3e3e3e] hover:bg-[#4e4e4e] cursor-pointer transition-colors" />
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className={cn(
          "bg-[#252526] border-r border-[#3e3e3e] transition-all duration-200 flex flex-col",
          sidebarExpanded ? "w-64" : "w-12"
        )}>
          {/* Action Buttons */}
          <div className="p-3 space-y-2 border-b border-[#3e3e3e]">
            <button
              onClick={handleOpenProject}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 hover:bg-[#2a2d2e] rounded transition-colors text-sm",
                !sidebarExpanded && "justify-center"
              )}
              title="Open project"
            >
              <Folder className="w-4 h-4 flex-shrink-0" />
              {sidebarExpanded && <span>Open project</span>}
            </button>
            <button
              onClick={handleCloneRepo}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 hover:bg-[#2a2d2e] rounded transition-colors text-sm",
                !sidebarExpanded && "justify-center"
              )}
              title="Clone repo"
            >
              <RefreshCw className="w-4 h-4 flex-shrink-0" />
              {sidebarExpanded && <span>Clone repo</span>}
            </button>
            <button
              onClick={handleConnectSSH}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 hover:bg-[#2a2d2e] rounded transition-colors text-sm",
                !sidebarExpanded && "justify-center"
              )}
              title="Connect via SSH"
            >
              <Network className="w-4 h-4 flex-shrink-0" />
              {sidebarExpanded && <span>Connect via SSH</span>}
            </button>
          </div>

          {/* Recent Projects Section */}
          {sidebarExpanded && (
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
              onClick={() => setSidebarExpanded(!sidebarExpanded)}
              className="w-full flex items-center justify-center p-2 hover:bg-[#2a2d2e] rounded transition-colors"
              title={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
            >
              <ChevronRight className={cn(
                "w-4 h-4 transition-transform",
                !sidebarExpanded && "rotate-180"
              )} />
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 bg-[#1e1e1e] flex flex-col overflow-hidden">
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center space-y-4 max-w-md">
              <div className="text-6xl mb-4">👋</div>
              <h2 className="text-2xl font-semibold text-gray-200">
                Welcome to Builder, {user.firstName}!
              </h2>
              <p className="text-gray-400">
                Get started by opening a project, cloning a repository, or connecting via SSH.
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
                  onClick={handleCloneRepo}
                  variant="outline"
                  className="bg-[#2d2d2d] border-[#3e3e3e] text-gray-300 hover:bg-[#3e3e3e]"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Clone Repo
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="h-6 bg-[#007acc] flex items-center justify-between px-3 text-xs text-white">
        <div className="flex items-center gap-4">
          <div title="Launchpad">
            <Rocket className="w-3.5 h-3.5 cursor-pointer hover:opacity-80" />
          </div>
          <div className="flex items-center gap-4">
            <span>0 errors</span>
            <span>0 warnings</span>
            <span>0 info</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-200">Ready</span>
          <Button
            onClick={onLogout}
            variant="ghost"
            size="sm"
            className="h-5 px-2 text-xs hover:bg-[#005a9e] text-white"
          >
            <LogOut className="w-3 h-3 mr-1" />
            Logout
          </Button>
        </div>
      </div>

      {/* Click outside to close menus */}
      {activeMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setActiveMenu(null)}
        />
      )}
    </div>
  )
}
