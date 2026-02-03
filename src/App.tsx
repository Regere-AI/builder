import { useEffect, useState } from 'react'

// Extend Window interface to include our custom APIs
declare global {
  interface Window {
    electronAPI?: {
      platform: string
      versions: {
        node: string
        chrome: string
        electron: string
      }
    }
    ipcRenderer?: {
      on: (channel: string, listener: (event: any, ...args: any[]) => void) => void
      off: (channel: string, listener: (event: any, ...args: any[]) => void) => void
      send: (channel: string, ...args: any[]) => void
      invoke: (channel: string, ...args: any[]) => Promise<any>
    }
  }
}

function App() {
  const [message, setMessage] = useState<string>('')
  const [versions, setVersions] = useState<{
    node: string
    chrome: string
    electron: string
  } | null>(null)

  useEffect(() => {
    // Listen for messages from main process
    if (window.ipcRenderer) {
      window.ipcRenderer.on('main-process-message', (_event, message: string) => {
        setMessage(message)
      })

      return () => {
        window.ipcRenderer?.off('main-process-message', () => {})
      }
    }
  }, [])

  useEffect(() => {
    // Get Electron API info
    if (window.electronAPI) {
      setVersions(window.electronAPI.versions)
    }
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>Regere Builder</h1>
        <p className="subtitle">A modern Electron application setup</p>
      </header>
    </div>
  )
}

export default App
