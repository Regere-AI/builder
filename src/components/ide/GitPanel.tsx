import { useState, useEffect, useCallback, useRef } from 'react'
import {
  X,
  GitBranch,
  RefreshCw,
  Check,
  Plus,
  Minus,
  RotateCcw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'
import {
  gitStatus,
  gitCommitStaged,
  gitCommitAmend,
  gitAdd,
  gitReset,
  gitPush,
  gitDiscard,
  type GitStatusEntry,
} from '@/desktop'

interface GitPanelProps {
  isOpen: boolean
  onClose: () => void
  repoPath: string | null
  /** When true, panel fills container (e.g. inside sidebar) instead of fixed width. */
  embedded?: boolean
  /** Increment to trigger status refresh (e.g. when files change). */
  refreshTrigger?: number
  /** Open a file in the main editor when clicked in the Git panel. */
  onOpenFileFromGit?: (path: string) => void
}

const DEFAULT_WIDTH = 320

type GitStatusCacheEntry = {
  entries: GitStatusEntry[]
  isRepo: boolean
}

const gitStatusCache = new Map<string, GitStatusCacheEntry>()

function getStatusBadge(status: string): string {
  const s = status.trim()
  if (s === '?' || s === '??') return 'U'
  if (s.includes('M')) return 'M'
  if (s.includes('A')) return 'A'
  if (s.includes('D')) return 'D'
  if (s.includes('R')) return 'R'
  if (s.includes('C')) return 'C'
  if (s.includes('U')) return 'U'
  return s || ' '
}

function getStatusBadgeColor(status: string): string {
  const s = status.trim()
  if (s === '?' || s === '??') return 'text-amber-400'
  if (s.includes('A')) return 'text-emerald-400'
  if (s.includes('M')) return 'text-blue-400'
  if (s.includes('D')) return 'text-red-400'
  if (s.includes('R')) return 'text-purple-400'
  return 'text-gray-400'
}

export function GitPanel({
  isOpen,
  onClose,
  repoPath,
  embedded,
  refreshTrigger,
  onOpenFileFromGit,
}: GitPanelProps) {
  const [entries, setEntries] = useState<GitStatusEntry[]>([])
  const [isRepo, setIsRepo] = useState(false)
  const [loading, setLoading] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [committing, setCommitting] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [commitDropdownOpen, setCommitDropdownOpen] = useState(false)
  const [stagedOpen, setStagedOpen] = useState(true)
  const [changesOpen, setChangesOpen] = useState(true)
  const [discardConfirm, setDiscardConfirm] = useState<string | null>(null)
  const commitDropdownRef = useRef<HTMLDivElement>(null)

  const fetchStatus = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false
    if (!repoPath) return
    if (!silent) setLoading(true)
    setError(null)
    try {
      const result = await gitStatus(repoPath)
      setIsRepo(result.isRepo)
      setEntries(result.entries ?? [])
      gitStatusCache.set(repoPath, {
        isRepo: result.isRepo,
        entries: result.entries ?? [],
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setEntries([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [repoPath])

  useEffect(() => {
    if (!isOpen || !repoPath) {
      setLoading(false)
      return
    }
    const cached = gitStatusCache.get(repoPath)
    if (cached) {
      setIsRepo(cached.isRepo)
      setEntries(cached.entries)
    }
    // Single round-trip to backend: git_status already checks if this is a repo.
    // If we have cached data, refresh in the background to keep UI snappy.
    fetchStatus(cached ? { silent: true } : undefined)
  }, [isOpen, repoPath, fetchStatus])

  useEffect(() => {
    if (refreshTrigger != null && refreshTrigger > 0 && repoPath && isRepo) {
      fetchStatus()
    }
  }, [refreshTrigger, repoPath, isRepo, fetchStatus])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (commitDropdownRef.current && !commitDropdownRef.current.contains(e.target as Node)) {
        setCommitDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const stagedEntries = entries.filter((e) => e.staged ?? (e.indexStatus && e.indexStatus !== ' ' && e.indexStatus !== '?'))
  const unstagedEntries = entries.filter(
    (e) => {
      const wt = e.workTreeStatus ?? e.status?.[1]
      return wt && wt !== ' ' && wt !== ''
    }
  )
  const hasStaged = stagedEntries.length > 0

  const doCommit = async (andPush?: boolean, amend?: boolean) => {
    if (!repoPath || !commitMessage.trim() || committing) return
    setCommitting(true)
    setError(null)
    setSuccess(false)
    setCommitDropdownOpen(false)
    try {
      // Refresh status before commit to avoid stale UI (e.g. showing staged when nothing is)
      const result = await gitStatus(repoPath)
      setEntries(result.entries ?? [])
      const freshStaged = (result.entries ?? []).filter(
        (e) => e.staged ?? (e.indexStatus && e.indexStatus !== ' ' && e.indexStatus !== '?')
      )
      if (!amend && freshStaged.length === 0) {
        setError('Nothing to commit: no changes are staged. Stage your changes first.')
        return
      }
      if (amend) {
        await gitCommitAmend(repoPath, commitMessage.trim())
      } else {
        await gitCommitStaged(repoPath, commitMessage.trim())
      }
      if (andPush) {
        await gitPush(repoPath)
      }
      if (!amend) setCommitMessage('')
      setSuccess(true)
      await fetchStatus()
      setTimeout(() => setSuccess(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCommitting(false)
    }
  }

  const handleStage = async (paths: string[]) => {
    if (!repoPath) return
    try {
      await gitAdd(repoPath, paths)
      await fetchStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleUnstage = async (paths: string[]) => {
    if (!repoPath) return
    try {
      await gitReset(repoPath, paths)
      await fetchStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleDiscard = async (path: string) => {
    if (!repoPath) return
    setDiscardConfirm(null)
    try {
      await gitDiscard(repoPath, path)
      await fetchStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleCommitKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      doCommit()
    }
  }

  if (!isOpen) return null

  return (
    <div
      className={cn(
        'bg-[#252526] flex flex-col h-full min-w-0',
        embedded ? 'flex-1 border-0' : 'shrink-0 border-r border-[#3e3e3e]'
      )}
      style={embedded ? undefined : { width: `${DEFAULT_WIDTH}px` }}
    >
      {/* Header */}
      <div className="h-12 border-b border-[#3e3e3e] flex items-center justify-between px-4 bg-[#2d2d2d]">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-300">Source Control</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-[#3e3e3e] rounded transition-colors"
          title="Close"
        >
          <X className="w-4 h-4 text-gray-400 hover:text-gray-200" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!repoPath ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <GitBranch className="w-12 h-12 text-gray-600 mb-4" />
            <p className="text-sm text-gray-500">Open an app to view changes</p>
          </div>
        ) : loading && entries.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <GitBranch className="w-12 h-12 text-gray-600 mb-4 animate-pulse" />
            <p className="text-sm text-gray-500">Checking repository…</p>
          </div>
        ) : !isRepo ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <GitBranch className="w-12 h-12 text-gray-600 mb-4" />
            <p className="text-sm text-gray-500">Not a git repository</p>
          </div>
        ) : (
          <>
            {/* Commit section at top */}
            <div className="p-3 border-b border-[#3e3e3e] bg-[#2d2d2d]">
              {error && (
                <p className="text-sm text-red-400 mb-2">{error}</p>
              )}
              {success && (
                <p className="text-sm text-emerald-400 mb-2 flex items-center gap-1">
                  <Check className="w-4 h-4" /> Committed successfully
                </p>
              )}
              <input
                type="text"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                onKeyDown={handleCommitKeyDown}
                placeholder="Message (Ctrl+Enter to commit)"
                className="w-full px-3 py-2 rounded border border-[#3e3e3e] bg-[#1e1e1e] text-sm text-gray-200 placeholder:text-gray-500 outline-none focus:border-[#007acc] mb-2"
                disabled={committing}
              />
              <div className="flex gap-1" ref={commitDropdownRef}>
                <Button
                  onClick={() => doCommit()}
                  disabled={!commitMessage.trim() || committing || !hasStaged}
                  className="flex-1"
                >
                  <Check className="w-4 h-4 mr-1" />
                  {committing ? 'Committing…' : 'Commit'}
                </Button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setCommitDropdownOpen((o) => !o)}
                    disabled={!commitMessage.trim() || committing}
                    className="p-2 rounded border border-[#3e3e3e] bg-[#2d2d2d] hover:bg-[#3e3e3e] disabled:opacity-50"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  {commitDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1 py-1 rounded bg-[#252526] border border-[#3e3e3e] shadow-lg z-10 min-w-[180px]">
                      <button
                        className="w-full px-3 py-1.5 text-left text-sm text-gray-200 hover:bg-[#3e3e3e]"
                        onClick={() => doCommit()}
                      >
                        Commit
                      </button>
                      <button
                        className="w-full px-3 py-1.5 text-left text-sm text-gray-200 hover:bg-[#3e3e3e]"
                        onClick={() => doCommit(true)}
                      >
                        Commit and Push
                      </button>
                      <button
                        className="w-full px-3 py-1.5 text-left text-sm text-gray-200 hover:bg-[#3e3e3e]"
                        onClick={() => {
                          setCommitDropdownOpen(false)
                          doCommit(false, true)
                        }}
                      >
                        Amend Last Commit
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2"
                onClick={async () => {
                  if (!repoPath) return
                  setPushing(true)
                  setError(null)
                  try {
                    await gitPush(repoPath)
                    await fetchStatus()
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e))
                  } finally {
                    setPushing(false)
                  }
                }}
                disabled={pushing}
              >
                {pushing ? 'Pushing…' : 'Push'}
              </Button>
            </div>

            {/* File changes - Staged and Changes */}
            <div className="flex-1 overflow-y-auto sidebar-scrollbar">
              <div className="flex items-center justify-between px-2 py-1 border-b border-[#3e3e3e] bg-[#2d2d2d]">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Changes
                </span>
                <button
                  onClick={() => fetchStatus()}
                  disabled={loading}
                  className="p-1.5 rounded hover:bg-[#3e3e3e] text-gray-400 hover:text-gray-200 disabled:opacity-50"
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {loading && entries.length === 0 ? (
                <p className="text-sm text-gray-500 px-4 py-4">Loading…</p>
              ) : entries.length === 0 ? (
                <p className="text-sm text-gray-500 px-4 py-4">No changes</p>
              ) : (
                <div className="py-1">
                  {/* Staged Changes */}
                  {stagedEntries.length > 0 && (
                    <div className="mb-2">
                      <button
                        className="flex items-center gap-1 w-full px-3 py-1.5 text-left hover:bg-[#2d2d2d]"
                        onClick={() => setStagedOpen((o) => !o)}
                      >
                        {stagedOpen ? (
                          <ChevronDown className="w-4 h-4 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                        )}
                        <span className="text-xs font-medium text-gray-400">
                          Staged Changes ({stagedEntries.length})
                        </span>
                        <div className="ml-auto flex gap-1">
                          <button
                            className="p-0.5 rounded hover:bg-[#3e3e3e] text-gray-500 hover:text-gray-200 text-xs"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleUnstage(stagedEntries.map((e) => e.path))
                            }}
                            title="Unstage All"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </button>
                      {stagedOpen && (
                        <div className="pl-2">
                          {stagedEntries.map((entry) => (
                            <GitFileRow
                              key={`staged-${entry.path}`}
                              entry={entry}
                              badge={getStatusBadge(entry.indexStatus ?? entry.status?.[0] ?? '')}
                              badgeColor={getStatusBadgeColor(entry.indexStatus ?? entry.status ?? '')}
                              onOpen={onOpenFileFromGit}
                              onStage={() => handleStage([entry.path])}
                              onUnstage={() => handleUnstage([entry.path])}
                              onDiscard={() => handleDiscard(entry.path)}
                              showStage={false}
                              showUnstage={true}
                              discardConfirm={discardConfirm === entry.path}
                              onDiscardConfirm={() => setDiscardConfirm(entry.path)}
                              onDiscardCancel={() => setDiscardConfirm(null)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Changes (unstaged) */}
                  {unstagedEntries.length > 0 && (
                    <div>
                      <button
                        className="flex items-center gap-1 w-full px-3 py-1.5 text-left hover:bg-[#2d2d2d]"
                        onClick={() => setChangesOpen((o) => !o)}
                      >
                        {changesOpen ? (
                          <ChevronDown className="w-4 h-4 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                        )}
                        <span className="text-xs font-medium text-gray-400">
                          Changes ({unstagedEntries.length})
                        </span>
                        <div className="ml-auto flex gap-1">
                          <button
                            className="p-0.5 rounded hover:bg-[#3e3e3e] text-gray-500 hover:text-gray-200 text-xs"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStage(unstagedEntries.map((e) => e.path))
                            }}
                            title="Stage All"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </button>
                      {changesOpen && (
                        <div className="pl-2">
                          {unstagedEntries.map((entry) => (
                            <GitFileRow
                              key={`unstaged-${entry.path}`}
                              entry={entry}
                              badge={getStatusBadge(entry.workTreeStatus ?? entry.status?.[1] ?? entry.status ?? '')}
                              badgeColor={getStatusBadgeColor(entry.workTreeStatus ?? entry.status ?? '')}
                              onOpen={onOpenFileFromGit}
                              onStage={() => handleStage([entry.path])}
                              onUnstage={() => handleUnstage([entry.path])}
                              onDiscard={() => handleDiscard(entry.path)}
                              showStage={true}
                              showUnstage={entry.staged}
                              discardConfirm={discardConfirm === entry.path}
                              onDiscardConfirm={() => setDiscardConfirm(entry.path)}
                              onDiscardCancel={() => setDiscardConfirm(null)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface GitFileRowProps {
  entry: GitStatusEntry
  badge: string
  badgeColor: string
  onOpen?: (path: string) => void
  onStage: () => void
  onUnstage: () => void
  onDiscard: () => void
  showStage: boolean
  showUnstage: boolean
  discardConfirm: boolean
  onDiscardConfirm: () => void
  onDiscardCancel: () => void
}

function GitFileRow({
  entry,
  badge,
  badgeColor,
  onOpen,
  onStage,
  onUnstage,
  onDiscard,
  showStage,
  showUnstage,
  discardConfirm,
  onDiscardConfirm,
  onDiscardCancel,
}: GitFileRowProps) {
  const fileName = entry.path.replace(/^.*[/\\]/, '') || entry.path

  return (
    <div
      className="group grid grid-cols-[1.5rem_minmax(0,1fr)_auto] gap-2 items-center px-2 py-1 rounded hover:bg-[#2d2d2d] text-sm cursor-pointer"
      onClick={() => onOpen?.(entry.path)}
    >
      <span className={cn('text-center text-xs font-medium', badgeColor)}>{badge}</span>
      <span className="truncate text-gray-300 min-w-0" title={entry.path}>
        {fileName}
      </span>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {showStage && (
          <button
            className="p-1 rounded hover:bg-[#3e3e3e] text-gray-500 hover:text-gray-200"
            onClick={onStage}
            title="Stage"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
        {showUnstage && (
          <button
            className="p-1 rounded hover:bg-[#3e3e3e] text-gray-500 hover:text-gray-200"
            onClick={onUnstage}
            title="Unstage"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        )}
        {discardConfirm ? (
          <>
            <button
              className="px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-500/20 rounded"
              onClick={onDiscard}
            >
              Confirm
            </button>
            <button
              className="px-1.5 py-0.5 text-xs text-gray-400 hover:bg-[#3e3e3e] rounded"
              onClick={onDiscardCancel}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            className="p-1 rounded hover:bg-[#3e3e3e] text-gray-500 hover:text-gray-200"
            onClick={onDiscardConfirm}
            title="Discard"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
