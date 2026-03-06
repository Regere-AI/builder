import { useState, useEffect, useMemo } from 'react'
import { Rocket, Plus, X, Mail, Check, Globe, Pencil, Trash2, Search, FolderOpen, GitBranch, LogOut } from 'lucide-react'
import { Button } from '../ui/button'
import {
  launchpadList,
  launchpadAdd,
  launchpadUpdate,
  launchpadDelete,
  launchpadGet,
  launchpadLogin,
  setLaunchpadSession,
  type LaunchpadConfig,
  type LaunchpadEnvironment,
} from '@/services/api'
import { openAppFolder, getDefaultWorkspaceRoot, gitClone, isTauri } from '@/desktop'
import { cn } from '@/lib/utils'

const DEFAULT_COLOR = '#007acc'
const ENVIRONMENTS: { value: LaunchpadEnvironment; label: string }[] = [
  { value: 'dev', label: 'Dev' },
  { value: 'qa', label: 'QA' },
  { value: 'prod', label: 'Prod' },
]

function getHostLabel(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 32) || 'Launchpad'
  }
}

/** Derive folder name from repo URL, e.g. owner-repo */
function getRepoFolderName(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    if (trimmed.startsWith('git@')) {
      const match = trimmed.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/)
      if (match) return `${match[1]}-${match[2]}`
    }
    const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
    const path = u.pathname.replace(/^\//, '').replace(/\.git$/, '').replace(/\/$/, '')
    const parts = path.split('/').filter(Boolean)
    if (parts.length >= 2) return `${parts[0]}-${parts[1]}`
    if (parts.length === 1) return parts[0]
  } catch {
    // fallback: take last non-empty segment
    const segs = trimmed.split(/[/:]/).filter(Boolean)
    if (segs.length >= 2) return `${segs[segs.length - 2]}-${segs[segs.length - 1]}`
    if (segs.length === 1) return segs[0]
  }
  return null
}

interface LaunchpadSelectPageProps {
  user: { firstName: string; lastName: string; email: string }
  onGetIn: (selectedLaunchpad: LaunchpadConfig | null) => void
  onLogout: () => void
}

const initialForm = { url: '', email: '', password: '', color: DEFAULT_COLOR, environment: 'dev' as LaunchpadEnvironment, customerName: '', tenant: '', configFolderPath: '' }

export function LaunchpadSelectPage({ user, onGetIn, onLogout }: LaunchpadSelectPageProps) {
  const [launchpads, setLaunchpads] = useState<LaunchpadConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null)
  const [form, setForm] = useState(initialForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [cloneUrl, setCloneUrl] = useState('')
  const [cloneParentPath, setCloneParentPath] = useState<string | null>(null)
  const [cloneLoading, setCloneLoading] = useState(false)
  const [cloneError, setCloneError] = useState<string | null>(null)
  const [connectDialogConfig, setConnectDialogConfig] = useState<LaunchpadConfig | null>(null)
  const [connectPassword, setConnectPassword] = useState('')
  const [connectError, setConnectError] = useState<string | null>(null)
  const [connectLoading, setConnectLoading] = useState(false)

  const filteredLaunchpads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return launchpads
    return launchpads.filter((c) => {
      const url = (c.url ?? '').toLowerCase()
      const email = (c.email ?? '').toLowerCase()
      const customerName = (c.customerName ?? '').toLowerCase()
      const tenant = (c.tenant ?? '').toLowerCase()
      const configFolderPath = (c.configFolderPath ?? '').toLowerCase()
      const env = (c.environment ?? 'dev').toLowerCase()
      return url.includes(q) || email.includes(q) || customerName.includes(q) || tenant.includes(q) || configFolderPath.includes(q) || env.includes(q)
    })
  }, [launchpads, searchQuery])

  const showSearch = launchpads.length > 7

  const loadLaunchpads = () => {
    launchpadList()
      .then(setLaunchpads)
      .catch(() => setLaunchpads([]))
  }

  useEffect(() => {
    launchpadList()
      .then(setLaunchpads)
      .catch(() => setLaunchpads([]))
      .finally(() => setLoading(false))
  }, [])

  const openConnectDialog = (config: LaunchpadConfig) => {
    setConnectDialogConfig(config)
    setConnectPassword('')
    setConnectError(null)
    setConnectLoading(false)
  }

  const closeConnectDialog = () => {
    setConnectDialogConfig(null)
    setConnectPassword('')
    setConnectError(null)
    setConnectLoading(false)
  }

  const handleConnectSubmit = async () => {
    const config = connectDialogConfig
    if (!config) return
    const password = connectPassword.trim()
    if (!password) {
      setConnectError('Password is required')
      return
    }
    const full = launchpadGet(config.id)
    if (!full?.configFolderPath?.trim()) {
      setConnectError('Launchpad config folder path is not set')
      return
    }
    const tenantId = config.tenant?.trim()
    if (!tenantId) {
      setConnectError('Launchpad tenant is not set')
      return
    }
    setConnectLoading(true)
    setConnectError(null)
    try {
      const { sessionToken } = await launchpadLogin(config.url, tenantId, config.email, password)
      setLaunchpadSession({ launchpadId: full.id, url: full.url, token: sessionToken, tenant: config.tenant ?? '' })
      closeConnectDialog()
      onGetIn(full)
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setConnectLoading(false)
    }
  }

  const handleConnect = (config: LaunchpadConfig) => {
    openConnectDialog(config)
  }

  const openDialog = () => {
    setEditId(null)
    setForm(initialForm)
    setFormError(null)
    setCloneUrl('')
    setCloneParentPath(null)
    setCloneError(null)
    setDialogOpen(true)
  }

  const openEditDialog = (config: LaunchpadConfig) => {
    const full = launchpadGet(config.id)
    setEditId(config.id)
    setForm({
      url: config.url,
      email: config.email,
      password: full?.password ?? '',
      color: config.color ?? DEFAULT_COLOR,
      environment: config.environment ?? 'dev',
      customerName: config.customerName ?? '',
      tenant: config.tenant ?? '',
      configFolderPath: config.configFolderPath ?? '',
    })
    setFormError(null)
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditId(null)
    setForm(initialForm)
    setFormError(null)
    setCloneUrl('')
    setCloneParentPath(null)
    setCloneError(null)
  }

  const handleSaveLaunchpad = async () => {
    const url = form.url.trim()
    const email = form.email.trim()
    if (!url) {
      setFormError('URL is required')
      return
    }
    if (!email) {
      setFormError('Email is required')
      return
    }
    const tenant = form.tenant.trim()
    if (!tenant) {
      setFormError('Tenant is required')
      return
    }
    const customerName = form.customerName.trim()
    if (!customerName) {
      setFormError('Customer name is required')
      return
    }
    const configFolderPath = form.configFolderPath.trim()
    if (!configFolderPath) {
      setFormError('Config folder path is required')
      return
    }
    if (!editId && !form.password) {
      setFormError('Password is required')
      return
    }
    setFormSubmitting(true)
    setFormError(null)
    try {
      if (editId) {
        await launchpadUpdate(editId, {
          url,
          email,
          ...(form.password ? { password: form.password } : {}),
          tenant,
          configFolderPath,
          color: form.color || DEFAULT_COLOR,
          environment: form.environment,
          customerName,
        })
      } else {
        await launchpadAdd({ url, email, password: form.password, tenant, customerName, configFolderPath, color: form.color || DEFAULT_COLOR, environment: form.environment })
      }
      loadLaunchpads()
      closeDialog()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save launchpad')
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleRemoveLaunchpad = async (id: string) => {
    try {
      await launchpadDelete(id)
      if (selectedId === id) setSelectedId(null)
      loadLaunchpads()
      setRemoveConfirmId(null)
    } catch {
      // ignore
    }
  }

  const handleCloneInDialog = async () => {
    if (!isTauri()) {
      setCloneError('Clone is only available in the desktop app.')
      return
    }
    const url = cloneUrl.trim()
    if (!url) {
      setCloneError('Repository URL is required')
      return
    }
    const folderName = getRepoFolderName(url)
    if (!folderName) {
      setCloneError('Could not parse repository URL. Use format: https://github.com/owner/repo')
      return
    }
    setCloneLoading(true)
    setCloneError(null)
    try {
      const parentDir = cloneParentPath ?? (await getDefaultWorkspaceRoot())
      const normalized = parentDir.replace(/[/\\]+$/, '')
      const pathSep = normalized.includes('\\') ? '\\' : '/'
      const targetPath = `${normalized}${pathSep}${folderName}`
      const clonedPath = await gitClone(url, targetPath)
      setForm((f) => ({ ...f, configFolderPath: clonedPath }))
      setFormError(null)
    } catch (e) {
      setCloneError(e instanceof Error ? e.message : 'Clone failed')
    } finally {
      setCloneLoading(false)
    }
  }

  const handleCloneChooseFolderInDialog = async () => {
    if (!isTauri()) {
      setCloneError('Choose folder is only available in the desktop app.')
      return
    }
    try {
      const result = await openAppFolder()
      if (!result.canceled && result.path) {
        setCloneParentPath(result.path)
        setCloneError(null)
      }
    } catch (e) {
      setCloneError(e instanceof Error ? e.message : 'Failed to open folder picker')
    }
  }

  return (
    <div className="min-h-screen bg-[#1e1e1e] flex flex-col items-center p-6 overflow-auto">
      <div className="w-full max-w-4xl flex flex-col">
        <div className="flex justify-end mb-4 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onLogout}
            className="border-[#4e4e4e] bg-[#2d2d2d] text-gray-300 hover:bg-[#3e3e3e] hover:text-white hover:border-[#5e5e5e]"
          >
            <LogOut className="w-3.5 h-3.5 mr-1.5" />
            Logout
          </Button>
        </div>
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#007acc] to-[#005a9e] shadow-lg shadow-[#007acc]/20 mb-5">
            <Rocket className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-100 tracking-tight">
            Choose your launchpad
          </h1>
          <p className="text-gray-400 mt-2 text-lg">
            Hi {user.firstName}, pick an environment to start building.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="flex flex-col items-center gap-3 text-gray-500">
              <div className="w-10 h-10 rounded-full border-2 border-[#007acc] border-t-transparent animate-spin" />
              <span>Loading launchpads…</span>
            </div>
          </div>
        ) : (
          <>
            {launchpads.length > 0 ? (
              <div className="mb-8">
                {showSearch && (
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by URL, email, customer or environment…"
                      className="w-full rounded-lg border border-[#3e3e3e] bg-[#2d2d2d] pl-10 pr-4 py-2.5 text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-[#007acc]"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-200"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredLaunchpads.map((config) => {
                    const isSelected = selectedId === config.id
                    const hostLabel = getHostLabel(config.url)
                    const accentColor = config.color ?? DEFAULT_COLOR
                    return (
                      <div
                        key={config.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(config.id)}
                        onKeyDown={(e) => e.key === 'Enter' && setSelectedId(config.id)}
                        className={cn(
                          'group relative rounded-2xl border-2 text-left overflow-hidden transition-all duration-200 cursor-pointer',
                          'hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1e1e1e]',
                          isSelected
                            ? 'border-[#007acc] bg-[#007acc]/5 shadow-lg shadow-[#007acc]/15 focus-visible:ring-[#007acc]'
                            : 'border-[#3e3e3e] bg-[#2d2d2d] hover:border-[#5e5e5e] focus-visible:ring-[#5e5e5e]'
                        )}
                      >
                        <div
                          className="h-20 flex items-center justify-center transition-opacity group-hover:opacity-95"
                          style={{
                            background: isSelected
                              ? `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)`
                              : undefined,
                            backgroundColor: !isSelected ? '#353535' : undefined,
                          }}
                        >
                          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/10">
                            <Globe className="w-6 h-6 text-white/90" />
                          </div>
                        </div>
                        <div className="absolute top-3 right-3 flex items-center gap-1">
                          {isSelected && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-white mr-1" style={{ backgroundColor: accentColor }}>
                              Active
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openEditDialog(config) }}
                            className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/10"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setRemoveConfirmId(config.id) }}
                            className="p-2 rounded-lg text-gray-400 hover:text-red-300 hover:bg-red-400/20"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="p-5">
                          {config.customerName && (
                            <p className="text-gray-500 text-sm truncate mb-0.5" title={config.customerName}>
                              {config.customerName}
                            </p>
                          )}
                          <p className="text-gray-100 font-semibold text-lg truncate" title={config.url}>
                            {hostLabel}
                          </p>
                          <div className="flex items-center gap-2 mt-2 text-gray-400 text-sm">
                            <Mail className="w-4 h-4 shrink-0 opacity-80" />
                            <span className="truncate" title={config.email}>{config.email}</span>
                          </div>
                          {isSelected && (
                            <div className="mt-4 flex items-center gap-2 text-sm font-medium" style={{ color: accentColor }}>
                              <div className="flex items-center justify-center w-5 h-5 rounded-full bg-white/20" style={{ backgroundColor: `${accentColor}33` }}>
                                <Check className="w-3 h-3" />
                              </div>
                              Selected
                            </div>
                          )}
                          <div className="mt-4 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleConnect(config) }}
                              className="flex-1 rounded-lg px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                              style={{ backgroundColor: accentColor }}
                            >
                              Connect
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {/* Add new card */}
                  <button
                    type="button"
                    onClick={openDialog}
                    className="flex flex-col items-center justify-center min-h-[220px] rounded-2xl border-2 border-dashed border-[#4e4e4e] bg-[#2d2d2d]/50 hover:border-[#007acc] hover:bg-[#007acc]/5 transition-all duration-200 group"
                  >
                    <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[#3e3e3e] group-hover:bg-[#007acc]/20 mb-3 transition-colors">
                      <Plus className="w-7 h-7 text-gray-400 group-hover:text-[#007acc]" />
                    </div>
                    <span className="text-gray-400 group-hover:text-gray-300 font-medium">Add launchpad</span>
                    <span className="text-gray-500 text-sm mt-1">Connect a new environment</span>
                  </button>
                </div>
                {showSearch && searchQuery && filteredLaunchpads.length === 0 && (
                  <p className="text-gray-500 text-sm mt-3">No launchpads match your search.</p>
                )}
              </div>
            ) : (
              <div className="mb-8">
                <button
                  type="button"
                  onClick={openDialog}
                  className="flex flex-col items-center justify-center min-h-[220px] w-[280px] rounded-2xl border-2 border-dashed border-[#4e4e4e] bg-[#2d2d2d]/50 hover:border-[#007acc] hover:bg-[#007acc]/5 transition-all duration-200 group"
                >
                  <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[#3e3e3e] group-hover:bg-[#007acc]/20 mb-3 transition-colors">
                    <Plus className="w-7 h-7 text-gray-400 group-hover:text-[#007acc]" />
                  </div>
                  <span className="text-gray-400 group-hover:text-gray-300 font-medium">Add launchpad</span>
                  <span className="text-gray-500 text-sm mt-1">Connect a new environment</span>
                </button>
              </div>
            )}

            {launchpads.length === 0 && (
              <div className="rounded-2xl border border-[#3e3e3e] bg-[#2d2d2d]/80 p-8 text-center mb-6">
                <p className="text-gray-400">
                  No launchpads yet. Add one using the card above to get started.
                </p>
              </div>
            )}
          </>
        )}

      </div>

      {/* Add / Edit launchpad dialog */}
      {dialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={(e) => e.target === e.currentTarget && closeDialog()}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-[#3e3e3e] bg-[#2d2d2d] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between shrink-0 p-4 border-b border-[#3e3e3e]">
              <h2 className="text-lg font-semibold text-gray-200">
                {editId ? 'Edit launchpad' : 'Add launchpad'}
              </h2>
              <button
                type="button"
                onClick={closeDialog}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-[#3e3e3e]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              className="flex flex-col min-h-0 p-4 overflow-y-auto"
              onSubmit={(e) => {
                e.preventDefault()
                handleSaveLaunchpad()
              }}
            >
              {formError && (
                <p className="text-sm text-red-400 mb-4">{formError}</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Customer: two columns */}
                <div className="space-y-3 rounded-lg border border-[#3e3e3e] bg-[#1e1e1e]/50 p-3 sm:col-span-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1.5">Customer name (required)</label>
                      <input
                        type="text"
                        value={form.customerName}
                        onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                        placeholder="e.g. Acme Corp"
                        className="w-full rounded-md border border-[#3e3e3e] bg-[#1e1e1e] px-3 py-2 text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-[#007acc]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1.5">Tenant (required)</label>
                      <input
                        type="text"
                        value={form.tenant}
                        onChange={(e) => setForm((f) => ({ ...f, tenant: e.target.value }))}
                        placeholder="e.g. acme-prod"
                        className="w-full rounded-md border border-[#3e3e3e] bg-[#1e1e1e] px-3 py-2 text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-[#007acc]"
                      />
                    </div>
                  </div>
                </div>
                {/* Clone from GitHub - only in Add mode */}
                {!editId && (
                  <div className="space-y-3 rounded-lg border border-[#3e3e3e] bg-[#1e1e1e]/50 p-3 sm:col-span-2">
                    <div className="flex items-center gap-2">
                      <GitBranch className="w-4 h-4 text-[#007acc]" />
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Clone from GitHub</p>
                    </div>
                    <p className="text-xs text-gray-500">Enter a repo URL to clone. The cloned folder will be used as the config folder.</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={cloneUrl}
                        onChange={(e) => { setCloneUrl(e.target.value); setCloneError(null) }}
                        placeholder="https://github.com/owner/repo or git@github.com:owner/repo.git"
                        className="flex-1 rounded-md border border-[#3e3e3e] bg-[#1e1e1e] px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-[#007acc]"
                        disabled={cloneLoading}
                      />
                      <button
                        type="button"
                        onClick={handleCloneChooseFolderInDialog}
                        disabled={cloneLoading}
                        className="shrink-0 rounded-md border border-[#3e3e3e] bg-[#1e1e1e] p-2 text-gray-400 hover:text-gray-200 hover:bg-[#3e3e3e] disabled:opacity-50"
                        title="Choose folder for clone"
                      >
                        <FolderOpen className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleCloneInDialog}
                        disabled={cloneLoading || !cloneUrl.trim()}
                        className="shrink-0 rounded-md px-4 py-2 text-sm font-medium text-white bg-[#007acc] hover:bg-[#0098e6] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {cloneLoading ? 'Cloning…' : 'Clone'}
                      </button>
                    </div>
                    {cloneParentPath && (
                      <p className="text-xs text-gray-500 truncate" title={cloneParentPath}>
                        Clone to: {cloneParentPath}
                      </p>
                    )}
                    {cloneError && (
                      <p className="text-sm text-red-400">{cloneError}</p>
                    )}
                  </div>
                )}
                {/* Config folder: full width */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">Config folder path (required)</label>
                  <p className="text-xs text-gray-500 mb-1.5">All configurations created will be stored in this folder.</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={form.configFolderPath}
                      onChange={(e) => setForm((f) => ({ ...f, configFolderPath: e.target.value }))}
                      placeholder="/path/to/config/folder"
                      className="flex-1 rounded-md border border-[#3e3e3e] bg-[#1e1e1e] px-3 py-2 text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-[#007acc]"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (!isTauri()) {
                          setFormError('Choose folder is only available in the desktop app.')
                          return
                        }
                        try {
                          const result = await openAppFolder()
                          if (!result.canceled && result.path) {
                            setForm((f) => ({ ...f, configFolderPath: result.path ?? '' }))
                            setFormError(null)
                          }
                        } catch (e) {
                          setFormError(e instanceof Error ? e.message : 'Failed to open folder picker')
                        }
                      }}
                      className="shrink-0 rounded-md border border-[#3e3e3e] bg-[#1e1e1e] p-2 text-gray-400 hover:text-gray-200 hover:bg-[#3e3e3e] focus:outline-none focus:ring-1 focus:ring-[#007acc]"
                      title="Choose folder"
                    >
                      <FolderOpen className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                {/* URL | Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">URL</label>
                  <input
                    type="url"
                    value={form.url}
                    onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                    placeholder="https://..."
                    className="w-full rounded-md border border-[#3e3e3e] bg-[#1e1e1e] px-3 py-2 text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-[#007acc]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="you@example.com"
                    className="w-full rounded-md border border-[#3e3e3e] bg-[#1e1e1e] px-3 py-2 text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-[#007acc]"
                  />
                </div>
                {/* Password: full width on small screens, else one column */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">Password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder={editId ? 'Leave blank to keep current' : '••••••••'}
                    className="w-full rounded-md border border-[#3e3e3e] bg-[#1e1e1e] px-3 py-2 text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-[#007acc]"
                  />
                </div>
                {/* Environment | Color */}
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">Environment</label>
                  <div className="flex gap-2">
                    {ENVIRONMENTS.map((env) => (
                      <button
                        key={env.value}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, environment: env.value }))}
                        className={cn(
                          'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                          form.environment === env.value
                            ? 'border-[#007acc] bg-[#007acc]/20 text-[#007acc]'
                            : 'border-[#3e3e3e] bg-[#1e1e1e] text-gray-400 hover:border-[#5e5e5e] hover:text-gray-300'
                        )}
                      >
                        {env.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">Color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={form.color}
                      onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                      className="h-10 w-14 cursor-pointer rounded border border-[#3e3e3e] bg-[#1e1e1e] p-0.5 shrink-0"
                    />
                    <input
                      type="text"
                      value={form.color}
                      onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                      placeholder="#007acc"
                      className="flex-1 min-w-0 rounded-md border border-[#3e3e3e] bg-[#1e1e1e] px-3 py-2 text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-[#007acc] font-mono text-sm"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-4 mt-2 shrink-0 border-t border-[#3e3e3e]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeDialog}
                  className="flex-1 border-gray-500 bg-[#3e3e3e]/60 text-gray-100 hover:bg-[#4e4e4e] hover:text-white hover:border-gray-400"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={formSubmitting}
                  className="flex-1 bg-[#007acc] text-white hover:bg-[#0098e6]"
                >
                  {formSubmitting ? 'Saving…' : editId ? 'Save' : 'Add'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Connect to launchpad (password prompt + login) */}
      {connectDialogConfig && (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-black/60"
          onClick={(e) => e.target === e.currentTarget && closeConnectDialog()}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-[#3e3e3e] bg-[#2d2d2d] shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-200 mb-1">Connect to launchpad</h3>
            <p className="text-gray-500 text-sm mb-4">
              Enter your password to sign in to {connectDialogConfig.customerName || getHostLabel(connectDialogConfig.url)}.
            </p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Email</label>
                <input
                  type="text"
                  value={connectDialogConfig.email}
                  readOnly
                  className="w-full rounded-md border border-[#3e3e3e] bg-[#1e1e1e] px-3 py-2 text-gray-400 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Password</label>
                <input
                  type="password"
                  value={connectPassword}
                  onChange={(e) => setConnectPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full rounded-md border border-[#3e3e3e] bg-[#1e1e1e] px-3 py-2 text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-[#007acc]"
                  onKeyDown={(e) => e.key === 'Enter' && handleConnectSubmit()}
                  autoFocus
                />
              </div>
            </div>
            {connectError && (
              <p className="text-sm text-red-400 mb-4">{connectError}</p>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeConnectDialog}
                className="flex-1 border-gray-500 bg-[#3e3e3e]/60 text-gray-100 hover:bg-[#4e4e4e] hover:text-white hover:border-gray-400"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConnectSubmit}
                disabled={connectLoading}
                className="flex-1 bg-[#007acc] text-white hover:bg-[#0098e6]"
              >
                {connectLoading ? 'Signing in…' : 'Connect'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Remove confirmation */}
      {removeConfirmId && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
          onClick={(e) => e.target === e.currentTarget && setRemoveConfirmId(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-[#3e3e3e] bg-[#2d2d2d] shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-gray-200 font-medium mb-1">Remove this launchpad?</p>
            <p className="text-gray-500 text-sm mb-5">This cannot be undone.</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRemoveConfirmId(null)}
                className="flex-1 border-[#3e3e3e] text-gray-300 hover:bg-[#3e3e3e]"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => handleRemoveLaunchpad(removeConfirmId)}
                className="flex-1 bg-red-600 text-white hover:bg-red-700"
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
