import { LogOut, Rocket, RefreshCw } from 'lucide-react'
import { Button } from '../ui/button'
import type { LaunchpadConfig } from '@/services/api'

interface StatusBarProps {
  onLogout: () => void
  selectedLaunchpad?: LaunchpadConfig | null
  onSwitchLaunchpad: () => void
}

const DEFAULT_STATUS_BAR_COLOR = '#007acc'

export function StatusBar({ onLogout, selectedLaunchpad, onSwitchLaunchpad }: StatusBarProps) {
  const launchpadLabel = selectedLaunchpad
    ? (selectedLaunchpad.url.replace(/^https?:\/\//, '').replace(/\/$/, '') || selectedLaunchpad.url) +
      (selectedLaunchpad.tenant ? ` · tenant: ${selectedLaunchpad.tenant}` : '')
    : 'No launchpad'

  const barColor = selectedLaunchpad?.color?.trim() || DEFAULT_STATUS_BAR_COLOR

  return (
    <div
      className="h-6 flex items-center justify-between px-3 text-xs text-white"
      style={{ backgroundColor: barColor }}
    >
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2" title={selectedLaunchpad?.url ?? 'Launchpad'}>
          <Rocket className="w-3.5 h-3.5 shrink-0" />
          <span className="max-w-[200px] truncate text-gray-100">{launchpadLabel}</span>
        </div>
        <Button
          onClick={onSwitchLaunchpad}
          variant="ghost"
          size="sm"
          className="h-5 px-2 text-xs hover:bg-black/20 text-white shrink-0"
          title="Switch launchpad"
        >
          <RefreshCw className="w-3 h-3 mr-1" />
          Switch
        </Button>
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
          className="h-5 px-2 text-xs hover:bg-black/20 text-white"
        >
          <LogOut className="w-3 h-3 mr-1" />
          Logout
        </Button>
      </div>
    </div>
  )
}
