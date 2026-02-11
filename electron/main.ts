import { app, BrowserWindow, ipcMain, Menu, dialog } from 'electron'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { readFile, writeFile } from 'fs/promises'
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
    icon: join(process.env.VITE_PUBLIC!, '../public/favicon.ico'),
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

// Handle IPC for file operations
ipcMain.handle('save-file', async (_event, content: string, defaultPath?: string) => {
  if (!win) return { canceled: true }
  
  const result = await dialog.showSaveDialog(win, {
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    defaultPath: defaultPath || 'untitled.json'
  })
  
  if (!result.canceled && result.filePath) {
    try {
      await writeFile(result.filePath, content, 'utf-8')
      return { success: true, filePath: result.filePath }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }
  
  return { canceled: true }
})

ipcMain.handle('open-file', async () => {
  if (!win) return { canceled: true }
  
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'Text Files', extensions: ['txt'] }
    ]
  })
  
  if (!result.canceled && result.filePaths.length > 0) {
    try {
      const filePath = result.filePaths[0]
      const content = await readFile(filePath, 'utf-8')
      return { success: true, filePath, content }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }
  
  return { canceled: true }
})

// Create application menu
function createMenu() {
  const isMac = process.platform === 'darwin'
  
  const template: Electron.MenuItemConstructorOptions[] = [
    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            // Send message to renderer to create new file/project
            win?.webContents.send('menu-new-file')
          }
        },
        {
          label: 'Open',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            // Trigger open file via IPC
            win?.webContents.send('menu-open-requested')
          }
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            // Request save from renderer
            win?.webContents.send('menu-save-requested')
          }
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            // Request save as from renderer
            win?.webContents.send('menu-save-as-requested')
          }
        },
        { type: 'separator' },
        {
          label: isMac ? 'Quit' : 'Exit',
          accelerator: isMac ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit()
          }
        }
      ]
    },
    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: 'Undo' },
        { role: 'redo', label: 'Redo' },
        { type: 'separator' },
        { role: 'cut', label: 'Cut' },
        { role: 'copy', label: 'Copy' },
        { role: 'paste', label: 'Paste' },
        { role: 'selectAll', label: 'Select All' },
        { type: 'separator' },
        { role: 'delete', label: 'Delete' }
      ]
    },
    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload', label: 'Reload' },
        { role: 'forceReload', label: 'Force Reload' },
        { role: 'toggleDevTools', label: 'Toggle Developer Tools' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Actual Size' },
        { role: 'zoomIn', label: 'Zoom In' },
        { role: 'zoomOut', label: 'Zoom Out' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Toggle Full Screen' }
      ]
    },
    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize', label: 'Minimize' },
        { role: 'close', label: 'Close' }
      ]
    },
    // Help menu
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            if (win) {
              dialog.showMessageBox(win, {
                type: 'info',
                title: 'About Builder',
                message: 'Builder Application',
                detail: 'Version 1.0.0\n\nA modern application builder.'
              })
            }
          }
        }
      ]
    }
  ]

  // macOS specific menu adjustments
  if (isMac) {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about', label: 'About ' + app.getName() },
        { type: 'separator' },
        { role: 'services', label: 'Services' },
        { type: 'separator' },
        { role: 'hide', label: 'Hide ' + app.getName() },
        { role: 'hideOthers', label: 'Hide Others' },
        { role: 'unhide', label: 'Show All' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit ' + app.getName() }
      ]
    })
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(() => {
  createMenu()
  createWindow()
})
