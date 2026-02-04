import { app, BrowserWindow, ipcMain, session } from 'electron'
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
// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - vite:define plugin will replace
// the string literal with the actual value at build time
// In development, electron-vite injects this via define plugin
// The define plugin replaces process.env.VITE_DEV_SERVER_URL at build time
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
      // Disable web security to bypass CORS in development
      // WARNING: Only use this in development, not in production
      webSecurity: process.env.NODE_ENV === 'production',
    },
  })

  // Configure session to handle CORS for development
  if (process.env.NODE_ENV !== 'production') {
    const ses = session.defaultSession
    ses.webRequest.onHeadersReceived((details, callback) => {
      // Modify response headers to allow CORS
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Access-Control-Allow-Origin': ['*'],
          'Access-Control-Allow-Methods': ['GET, POST, PUT, DELETE, OPTIONS, PATCH'],
          'Access-Control-Allow-Headers': ['Content-Type, Authorization, REGERE-API-KEY, X-Requested-With'],
          'Access-Control-Allow-Credentials': ['true'],
        },
      })
    })
  }

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  // In development, VITE_DEV_SERVER_URL is injected by electron-vite
  // If not injected, try default Vite dev server URL
  const devServerUrl = url || (process.env.NODE_ENV !== 'production' ? 'http://localhost:5173' : undefined)
  
  console.log('APP_BASE_URL:', url)
  console.log('devServerUrl:', devServerUrl)
  console.log('NODE_ENV:', process.env.NODE_ENV)
  console.log('app.isPackaged:', app.isPackaged)
  
  // Add error handlers
  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', {
      errorCode,
      errorDescription,
      validatedURL
    })
  })

  win.webContents.on('dom-ready', () => {
    console.log('DOM is ready')
  })

  if (devServerUrl && !app.isPackaged) {
    // Development: load from Vite dev server
    console.log('Loading from dev server:', devServerUrl)
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
