import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import type { Client } from '@libsql/client'
import { createDbClient } from './db/client'
import { migrate } from './db/migrate'
import { getSettings } from './db/data'
import { registerIpc } from './ipc/register'
import { runSync } from './sync'
import { initUpdater } from './updater'

// Pin the app name BEFORE anything reads app.getPath('userData'). Without this,
// `electron-vite dev` reports the name as "Electron" and writes the DB to
// %APPDATA%/Electron, while the packaged app uses %APPDATA%/trackerapp — two
// separate databases. Setting it explicitly makes every launch share one dir.
app.setName('trackerapp')

let db: Client | null = null
let syncTimer: NodeJS.Timeout | null = null
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0d10',
    title: 'Project Tracker',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow = win
  win.on('ready-to-show', () => win.show())
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // electron-vite injects ELECTRON_RENDERER_URL in dev; load the built file in prod.
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function scheduleSync(): Promise<void> {
  if (!db) return
  if (syncTimer) clearInterval(syncTimer)
  const settings = await getSettings(db)
  const minutes = Math.max(1, settings.sync_interval_minutes || 30)
  syncTimer = setInterval(() => {
    if (db) void runSync(db)
  }, minutes * 60_000)
}

app.whenReady().then(async () => {
  db = createDbClient()
  await migrate(db)
  registerIpc(db)

  createWindow()

  // Background auto-update (packaged app only).
  initUpdater(() => mainWindow)

  // Sync once on launch, then on the configured interval. Fire-and-forget so the
  // window shows immediately; the renderer polls sync:status for progress.
  void runSync(db)
  await scheduleSync()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (syncTimer) clearInterval(syncTimer)
  db?.close()
})
