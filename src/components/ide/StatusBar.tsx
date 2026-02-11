import { LogOut, Rocket } from 'lucide-react'
import { Button } from '../ui/button'

interface StatusBarProps {
  onLogout: () => void
}

export function StatusBar({ onLogout }: StatusBarProps) {
  return (
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
  )
}
