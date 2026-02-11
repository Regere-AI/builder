import { Folder, RefreshCw } from 'lucide-react'
import { Button } from '../ui/button'

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
  const handleOpenProject = () => {
    console.log('Open project clicked')
    // TODO: Implement project opening functionality
  }

  return (
    <div className="flex-1 bg-[#1e1e1e] flex flex-col overflow-hidden">
      {/* Main Content Area */}
      <div className="flex-1 flex items-center justify-center p-8">
        {agentResponse ? (
          // TODO: Render agent response viewer
          <div className="text-gray-300">Agent Response Viewer (to be implemented)</div>
        ) : activeProject ? (
          // TODO: Render project/editor view
          <div className="text-gray-300">Project View (to be implemented)</div>
        ) : (
          <div className="text-center space-y-4 max-w-md">
            <div className="text-6xl mb-4">👋</div>
            <h2 className="text-2xl font-semibold text-gray-200">
              Welcome to Builder, {user.firstName}!
            </h2>
            <p className="text-gray-400">
              Get started by opening a project.
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
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
