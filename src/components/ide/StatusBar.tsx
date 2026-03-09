import { useEffect, useRef, useState } from 'react'
import { Rocket, RefreshCw, GitBranch, ChevronDown, Check, X } from 'lucide-react'
import { Button } from '../ui/button'
import type { LaunchpadConfig } from '@/services/api'
import { launchpadHealthCheck } from '@/services/api'
import { gitIsRepo, gitCurrentBranch, gitListBranches, gitCheckoutBranch, gitCreateBranch } from '@/desktop'

const LAUNCHPAD_HEALTH_POLL_MS = 30_000

interface StatusBarProps {
  selectedLaunchpad?: LaunchpadConfig | null
  onSwitchLaunchpad: () => void
  repoPath?: string | null
  onBranchChanged?: () => void
}

const DEFAULT_STATUS_BAR_COLOR = '#007acc'

export function StatusBar({
  selectedLaunchpad,
  onSwitchLaunchpad,
  repoPath,
  onBranchChanged,
}: StatusBarProps) {
  const [isRepo, setIsRepo] = useState<boolean | null>(null)
  const [currentBranch, setCurrentBranch] = useState<string | null>(null)
  const [branches, setBranches] = useState<string[]>([])
  const [branchListOpen, setBranchListOpen] = useState(false)
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [branchModalOpen, setBranchModalOpen] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [creatingBranch, setCreatingBranch] = useState(false)
  const [launchpadHealthy, setLaunchpadHealthy] = useState<boolean | null>(null)
  const branchMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!selectedLaunchpad?.url) {
      setLaunchpadHealthy(null)
      return
    }
    let cancelled = false
    const abortController = new AbortController()
    const check = async () => {
      try {
        const ok = await launchpadHealthCheck(selectedLaunchpad!.url, {
          signal: abortController.signal,
          timeoutMs: 5000,
        })
        if (!cancelled) setLaunchpadHealthy(ok)
      } catch {
        if (!cancelled) setLaunchpadHealthy(false)
      }
    }
    void check()
    const interval = setInterval(check, LAUNCHPAD_HEALTH_POLL_MS)
    return () => {
      cancelled = true
      abortController.abort()
      clearInterval(interval)
    }
  }, [selectedLaunchpad?.url])

  useEffect(() => {
    let cancelled = false

    const loadBranchInfo = async () => {
      if (!repoPath) {
        if (!cancelled) {
          setIsRepo(null)
          setCurrentBranch(null)
        }
        return
      }

      try {
        const repo = await gitIsRepo(repoPath)
        if (!repo) {
          if (!cancelled) {
            setIsRepo(false)
            setCurrentBranch(null)
          }
          return
        }

        const name = await gitCurrentBranch(repoPath)
        if (!cancelled) {
          setIsRepo(true)
          setCurrentBranch(name)
        }
      } catch {
        if (!cancelled) {
          setIsRepo(null)
          setCurrentBranch(null)
        }
      }
    }

    loadBranchInfo()

    return () => {
      cancelled = true
    }
  }, [repoPath])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (branchMenuRef.current && !branchMenuRef.current.contains(e.target as Node)) {
        setBranchListOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const refreshCurrentBranch = async () => {
    if (!repoPath) return
    try {
      const name = await gitCurrentBranch(repoPath)
      setCurrentBranch(name)
    } catch {
      setCurrentBranch(null)
    }
  }

  const openBranchList = async () => {
    if (!repoPath || !isRepo) return
    setBranchListOpen(true)
    setLoadingBranches(true)
    try {
      const list = await gitListBranches(repoPath)
      setBranches(list)
    } catch {
      setBranches([])
    } finally {
      setLoadingBranches(false)
    }
  }

  const handleToggleBranchList = () => {
    if (branchListOpen) {
      setBranchListOpen(false)
    } else {
      void openBranchList()
    }
  }

  const handleCheckoutBranch = async (name: string) => {
    if (!repoPath) return
    try {
      await gitCheckoutBranch(repoPath, name)
      await refreshCurrentBranch()
      setBranchListOpen(false)
      onBranchChanged?.()
    } catch {
      // Ignore for now; error feedback can be added later if needed.
    }
  }

  const handleCreateBranch = async () => {
    if (!repoPath || !newBranchName.trim() || creatingBranch) return
    setCreatingBranch(true)
    try {
      await gitCreateBranch(repoPath, newBranchName.trim())
      setBranchModalOpen(false)
      setBranchListOpen(false)
      setNewBranchName('')
      await openBranchList()
      await refreshCurrentBranch()
      onBranchChanged?.()
    } catch {
      // Ignore for now; error feedback can be added later if needed.
    } finally {
      setCreatingBranch(false)
    }
  }

  const launchpadLabel = selectedLaunchpad
    ? (selectedLaunchpad.url.replace(/^https?:\/\//, '').replace(/\/$/, '') || selectedLaunchpad.url) +
      (selectedLaunchpad.tenant ? ` · tenant: ${selectedLaunchpad.tenant}` : '')
    : 'No launchpad'

  const healthTooltip =
    launchpadHealthy === true
      ? 'Launchpad healthy'
      : launchpadHealthy === false
        ? 'Launchpad unreachable or unhealthy'
        : selectedLaunchpad?.url
          ? 'Checking launchpad health…'
          : ''

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
        {repoPath && isRepo && (
          <div className="relative" ref={branchMenuRef}>
            <button
              type="button"
              onClick={handleToggleBranchList}
              className="flex items-center gap-1 h-5 px-2 text-xs rounded hover:bg-black/20 text-gray-100 border border-white/10"
              title="Switch Git branch"
            >
              <GitBranch className="w-3 h-3" />
              <span className="max-w-[120px] truncate">
                {currentBranch ?? 'No branch'}
              </span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {branchListOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-56 rounded-md bg-[#252526] border border-[#3e3e3e] shadow-lg z-30">
                <div className="max-h-64 overflow-y-auto py-1">
                  <button
                    className="w-full px-3 py-1.5 text-left text-xs text-gray-200 hover:bg-[#3e3e3e]"
                    onClick={() => {
                      setBranchListOpen(false)
                      setBranchModalOpen(true)
                      setNewBranchName('')
                    }}
                  >
                    Create new branch…
                  </button>
                  <div className="border-t border-[#3e3e3e] my-1" />
                  {loadingBranches ? (
                    <div className="px-3 py-1.5 text-xs text-gray-400">Loading branches…</div>
                  ) : branches.length === 0 ? (
                    <div className="px-3 py-1.5 text-xs text-gray-400">No branches found</div>
                  ) : (
                    branches.map((name) => (
                      <button
                        key={name}
                        className="w-full px-3 py-1.5 text-left text-xs text-gray-200 hover:bg-[#3e3e3e] flex items-center gap-2"
                        onClick={() => handleCheckoutBranch(name)}
                      >
                        {currentBranch === name && (
                          <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                        )}
                        <span className="truncate">{name}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-4">
          <span>0 errors</span>
          <span>0 warnings</span>
          <span>0 info</span>
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {selectedLaunchpad?.url ? (
          <span
            className="shrink-0"
            title={healthTooltip}
          >
            {launchpadHealthy === true && (
              <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-semibold bg-emerald-600 text-white shadow-sm">
                <Check className="w-3 h-3 shrink-0" aria-hidden />
                Healthy
                <span className="sr-only">Launchpad healthy</span>
              </span>
            )}
            {launchpadHealthy === false && (
              <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-semibold bg-red-600 text-white shadow-sm animate-blink">
                <X className="w-3 h-3 shrink-0" aria-hidden />
                Unhealthy
                <span className="sr-only">Launchpad unreachable or unhealthy</span>
              </span>
            )}
            {launchpadHealthy === null && (
              <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-semibold bg-gray-600 text-white">
                <span className="w-3 h-3 rounded-full border-2 border-white/80 border-t-transparent animate-spin shrink-0" aria-hidden />
                Checking…
              </span>
            )}
          </span>
        ) : (
          <span className="text-gray-200">Ready</span>
        )}
      </div>

      {branchModalOpen && repoPath && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center pt-16 bg-black/60 backdrop-blur-sm"
          onClick={() => {
            if (creatingBranch) return
            setBranchModalOpen(false)
          }}
        >
          <div
            className="w-full max-w-sm rounded-md bg-[#252526] border border-[#3e3e3e] shadow-lg p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-gray-100 mb-2">Create new branch</h2>
            <p className="text-xs text-gray-400 mb-3">
              Enter a name for the new branch. It will be created from the current HEAD and
              checked out.
            </p>
            <input
              type="text"
              className="w-full px-3 py-1.5 rounded border border-[#3e3e3e] bg-[#1e1e1e] text-sm text-gray-200 placeholder:text-gray-500 outline-none focus:border-[#007acc]"
              placeholder="feature/my-branch"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleCreateBranch()
                }
              }}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (creatingBranch) return
                  setBranchModalOpen(false)
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!newBranchName.trim() || creatingBranch}
                onClick={() => void handleCreateBranch()}
              >
                {creatingBranch ? 'Creating…' : 'Create branch'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
