import { useState, useEffect } from 'react'
import { Rocket, ChevronRight, Plus, X } from 'lucide-react'
import { Button } from '../ui/button'
import { launchpadList, launchpadAdd, launchpadGet, type LaunchpadConfig } from '@/services/api'
import { cn } from '@/lib/utils'

interface LaunchpadSelectPageProps {
  user: { firstName: string; lastName: string; email: string }
  onGetIn: (selectedLaunchpad: LaunchpadConfig | null) => void
}

const initialForm = { url: '', email: '', password: '' }

export function LaunchpadSelectPage({ user, onGetIn }: LaunchpadSelectPageProps) {
  const [launchpads, setLaunchpads] = useState<LaunchpadConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSubmitting, setFormSubmitting] = useState(false)

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

  const canGetIn = launchpads.length > 0 && selectedId !== null

  const handleGetIn = () => {
    if (launchpads.length > 0 && selectedId) {
      const full = launchpadGet(selectedId)
      onGetIn(full ?? launchpads.find((c) => c.id === selectedId) ?? null)
    } else {
      onGetIn(null)
    }
  }

  const openDialog = () => {
    setForm(initialForm)
    setFormError(null)
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setForm(initialForm)
    setFormError(null)
  }

  const handleAddLaunchpad = async () => {
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
    if (!form.password) {
      setFormError('Password is required')
      return
    }
    setFormSubmitting(true)
    setFormError(null)
    try {
      await launchpadAdd({ url, email, password: form.password })
      loadLaunchpads()
      closeDialog()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to add launchpad')
    } finally {
      setFormSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-[#2d2d2d] border border-[#3e3e3e] mb-4">
            <Rocket className="w-7 h-7 text-[#007acc]" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-200">
            Choose your launchpad
          </h1>
          <p className="text-gray-500 mt-2">
            Hi {user.firstName}, select a launchpad to get started or continue to Builder.
          </p>
        </div>

        {loading ? (
          <div className="text-gray-500 text-center py-12">Loading launchpads…</div>
        ) : (
          <>
            {launchpads.length > 0 ? (
          <div className="space-y-3 mb-6">
            {launchpads.map((config) => (
              <button
                key={config.id}
                type="button"
                onClick={() => setSelectedId(config.id)}
                className={cn(
                  'w-full rounded-lg border p-4 text-left transition-colors flex items-center justify-between gap-3',
                  selectedId === config.id
                    ? 'border-[#007acc] bg-[#007acc]/10'
                    : 'border-[#3e3e3e] bg-[#2d2d2d] hover:border-[#5e5e5e] hover:bg-[#353535]'
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-gray-200 font-medium truncate" title={config.url}>
                    {config.url}
                  </p>
                  <p className="text-gray-500 text-sm truncate" title={config.email}>
                    {config.email}
                  </p>
                </div>
                <ChevronRight
                  className={cn(
                    'w-5 h-5 shrink-0',
                    selectedId === config.id ? 'text-[#007acc]' : 'text-gray-500'
                  )}
                />
              </button>
            ))}
          </div>
            ) : (
          <div className="rounded-lg border border-[#3e3e3e] bg-[#2d2d2d] p-6 text-center mb-6">
            <p className="text-gray-500">
              No launchpads configured yet. Add one below. (Stored locally in this browser/app.)
            </p>
          </div>
            )}
            <div className="flex justify-center mb-8">
              <Button
                type="button"
                variant="outline"
                onClick={openDialog}
                className="border-[#3e3e3e] bg-[#2d2d2d] text-gray-300 hover:bg-[#3e3e3e]"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add launchpad
              </Button>
            </div>
          </>
        )}

        {launchpads.length > 0 && (
          <div className="flex justify-center">
            <Button
              onClick={handleGetIn}
              disabled={!canGetIn}
              className="bg-[#007acc] text-white hover:bg-[#0098e6] px-8"
            >
              Get in
            </Button>
          </div>
        )}
      </div>

      {/* Add launchpad dialog */}
      {dialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={(e) => e.target === e.currentTarget && closeDialog()}
        >
          <div
            className="w-full max-w-md rounded-xl border border-[#3e3e3e] bg-[#2d2d2d] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[#3e3e3e]">
              <h2 className="text-lg font-semibold text-gray-200">Add launchpad</h2>
              <button
                type="button"
                onClick={closeDialog}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-[#3e3e3e]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              className="p-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                handleAddLaunchpad()
              }}
            >
              {formError && (
                <p className="text-sm text-red-400">{formError}</p>
              )}
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
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                  className="w-full rounded-md border border-[#3e3e3e] bg-[#1e1e1e] px-3 py-2 text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-[#007acc]"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeDialog}
                  className="flex-1 border-[#3e3e3e] text-gray-300 hover:bg-[#3e3e3e]"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={formSubmitting}
                  className="flex-1 bg-[#007acc] text-white hover:bg-[#0098e6]"
                >
                  {formSubmitting ? 'Adding…' : 'Add'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
