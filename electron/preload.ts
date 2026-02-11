import { contextBridge, ipcRenderer } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})

// You can also expose other APIs to the renderer process.
// For example, you can expose a custom API:
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  getEnv: (key: string) => ipcRenderer.invoke('get-env', key),
  // File operations
  saveFile: (content: string, defaultPath?: string) => 
    ipcRenderer.invoke('save-file', content, defaultPath),
  openFile: () => ipcRenderer.invoke('open-file'),
  // Menu event listeners
  onMenuNewFile: (callback: () => void) => {
    ipcRenderer.on('menu-new-file', () => callback())
  },
  onMenuOpenRequested: (callback: () => void) => {
    ipcRenderer.on('menu-open-requested', () => callback())
  },
  onMenuSaveRequested: (callback: () => void) => {
    ipcRenderer.on('menu-save-requested', () => callback())
  },
  onMenuSaveAsRequested: (callback: () => void) => {
    ipcRenderer.on('menu-save-as-requested', () => callback())
  },
  // Remove menu event listeners
  removeMenuListeners: () => {
    ipcRenderer.removeAllListeners('menu-new-file')
    ipcRenderer.removeAllListeners('menu-open-requested')
    ipcRenderer.removeAllListeners('menu-save-requested')
    ipcRenderer.removeAllListeners('menu-save-as-requested')
  },
})
