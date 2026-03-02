import { useState, useEffect } from 'react'
import { Settings, Cpu, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getBuilderSettings, setBuilderSettings } from '@/services/api'

type SettingsSection = 'models' | 'profile'

interface BuilderSettingsViewProps {
  user: {
    firstName: string
    lastName: string
    email: string
  }
}

export function BuilderSettingsView({ user }: BuilderSettingsViewProps) {
  const [section, setSection] = useState<SettingsSection>('models')
  const [openaiKey, setOpenaiKey] = useState('')
  const [claudeKey, setClaudeKey] = useState('')
  const [googleKey, setGoogleKey] = useState('')

  useEffect(() => {
    const s = getBuilderSettings()
    setOpenaiKey(s.openaiApiKey ?? '')
    setClaudeKey(s.claudeApiKey ?? '')
    setGoogleKey(s.googleApiKey ?? '')
  }, [])

  const saveOpenai = (value: string) => {
    setOpenaiKey(value)
    setBuilderSettings({ openaiApiKey: value || undefined })
  }
  const saveClaude = (value: string) => {
    setClaudeKey(value)
    setBuilderSettings({ claudeApiKey: value || undefined })
  }
  const saveGoogle = (value: string) => {
    setGoogleKey(value)
    setBuilderSettings({ googleApiKey: value || undefined })
  }

  const navItems: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { id: 'models', label: 'Models', icon: <Cpu className="w-4 h-4" /> },
    { id: 'profile', label: 'Developer profile', icon: <User className="w-4 h-4" /> },
  ]

  return (
    <div className="flex-1 flex overflow-hidden bg-[#1e1e1e]">
      {/* Left menu */}
      <nav className="w-52 shrink-0 border-r border-[#3e3e3e] bg-[#252526] flex flex-col py-2">
        <div className="px-3 py-2 flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wider">
          <Settings className="w-4 h-4" />
          Settings
        </div>
        <ul className="mt-2">
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setSection(item.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
                  section === item.id
                    ? 'bg-[#094771] text-white'
                    : 'text-gray-300 hover:bg-[#2a2d2e] hover:text-gray-100'
                )}
              >
                {item.icon}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {section === 'models' && (
          <div className="max-w-2xl space-y-6">
            <h2 className="text-lg font-semibold text-gray-200">Models</h2>
            <p className="text-sm text-gray-400">
              Configure API keys for AI models. Keys are stored locally on your device.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">OpenAI API key</label>
                <input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => saveOpenai(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 bg-[#2d2d2d] border border-[#3e3e3e] rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#007acc]"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Anthropic API key</label>
                <input
                  type="password"
                  value={claudeKey}
                  onChange={(e) => saveClaude(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full px-3 py-2 bg-[#2d2d2d] border border-[#3e3e3e] rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#007acc]"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Google API key</label>
                <input
                  type="password"
                  value={googleKey}
                  onChange={(e) => saveGoogle(e.target.value)}
                  placeholder="AIza..."
                  className="w-full px-3 py-2 bg-[#2d2d2d] border border-[#3e3e3e] rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#007acc]"
                  autoComplete="off"
                />
              </div>
            </div>
          </div>
        )}

        {section === 'profile' && (
          <div className="max-w-2xl space-y-6">
            <h2 className="text-lg font-semibold text-gray-200">Developer profile</h2>
            <p className="text-sm text-gray-400">
              Your signed-in developer account.
            </p>
            <div className="rounded-lg border border-[#3e3e3e] bg-[#2d2d2d] p-4 space-y-3">
              <div>
                <span className="text-xs text-gray-500 uppercase tracking-wider">Name</span>
                <p className="text-gray-200 font-medium">
                  {user.firstName} {user.lastName}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase tracking-wider">Email</span>
                <p className="text-gray-200 font-medium">{user.email}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
