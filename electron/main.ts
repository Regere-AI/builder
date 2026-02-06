import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { fileURLToPath } from 'url'
import 'dotenv/config'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

process.env.DIST = join(__dirname, '../renderer')
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : join(process.env.DIST, '../public')

let win: BrowserWindow | null = null
// Here, you can also use other preload
const preload = join(__dirname, '../preload/index.js')

const url = process.env["APP_BASE_URL"]


function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: join(process.env.VITE_PUBLIC!, 'favicon.ico'),
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // In development, VITE_DEV_SERVER_URL is injected by electron-vite
  // If not injected, try default Vite dev server URL
  const devServerUrl = url || (process.env.NODE_ENV !== 'production' ? 'http://localhost:5173' : undefined)
  
  // Add error handlers
  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', {
      errorCode,
      errorDescription,
      validatedURL
    })
  })

  if (devServerUrl && !app.isPackaged) {
    // Development: load from Vite dev server
    win.loadURL(devServerUrl).catch((err) => {
      console.error('Failed to load URL:', err)
      // Show error in window
      win?.webContents.executeJavaScript(`
        document.body.innerHTML = '<div style="padding: 20px; font-family: monospace;">
          <h1>Failed to Load</h1>
          <p>Error: ${err.message || err}</p>
          <p>URL: ${devServerUrl}</p>
          <p>Check the terminal for more details.</p>
        </div>'
      `)
    })
  } else {
    // Production: load from built renderer files
    const rendererPath = join(process.env.DIST!, 'index.html')
    win.loadFile(rendererPath).catch((err) => {
      console.error('Failed to load file:', err)
    })
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Handle IPC for environment variables
ipcMain.handle('get-env', (_event, key: string) => {
  return process.env[key] || null
})

app.whenReady().then(() => {
  createWindow()
})
