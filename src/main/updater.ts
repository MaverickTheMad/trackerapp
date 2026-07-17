import { app, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import { IPC } from '@shared/ipc'
import type { UpdateStatus } from '@shared/types'

// electron-updater is CommonJS; destructure the default export under ESM.
const { autoUpdater } = electronUpdater

// Auto-update via electron-builder's publish config (GitHub Releases). The
// packaged app checks for a newer release on launch and every 6h, downloads it
// in the background, and installs on quit (or immediately if the user clicks
// "restart"). Disabled in dev (`app.isPackaged` is false there — no feed).

let getWindow: () => BrowserWindow | null = () => null
let status: UpdateStatus = { state: 'idle' }

function emit(patch: UpdateStatus): void {
  status = patch
  getWindow()?.webContents.send(IPC.updateEvent, status)
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

export function initUpdater(windowGetter: () => BrowserWindow | null): void {
  getWindow = windowGetter

  if (!app.isPackaged) {
    status = { state: 'idle', message: 'Updates run only in the installed app.' }
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => emit({ state: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => emit({ state: 'not-available' }))
  autoUpdater.on('download-progress', (p) =>
    emit({ state: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    emit({ state: 'downloaded', version: info.version })
  )
  autoUpdater.on('error', (err) =>
    emit({ state: 'error', message: err instanceof Error ? err.message : String(err) })
  )

  // Check shortly after launch, then every 6 hours.
  setTimeout(() => void checkForUpdates(), 8000)
  setInterval(() => void checkForUpdates(), 6 * 60 * 60 * 1000)
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) return status
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    emit({ state: 'error', message: err instanceof Error ? err.message : String(err) })
  }
  return status
}

export function quitAndInstall(): void {
  if (app.isPackaged && status.state === 'downloaded') autoUpdater.quitAndInstall()
}
