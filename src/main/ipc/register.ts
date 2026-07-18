import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { Client } from '@libsql/client'
import { IPC } from '@shared/ipc'
import type { Task, ChatImportResult } from '@shared/types'
import * as data from '../db/data'
import { parseChatExport } from '../import/chatExport'
import { runSync, getSyncStatus } from '../sync'
import { checkForUpdates, quitAndInstall, getUpdateStatus } from '../updater'

const DEFAULT_IDLE_CAP = 1800

// Wires every IPC channel to exactly one data-module or sync call. The renderer
// never sees SQL or the client — only these typed request/response shapes.
export function registerIpc(client: Client): void {
  ipcMain.handle(IPC.projectsList, () => data.getProjectsOverview(client))
  ipcMain.handle(IPC.projectsUpsert, (_e, input) => data.upsertProject(client, input))
  ipcMain.handle(IPC.projectsDelete, (_e, id: string) => data.deleteProject(client, id))

  ipcMain.handle(IPC.tasksList, (_e, projectId: string) => data.getTasks(client, projectId))
  ipcMain.handle(IPC.tasksListAll, (_e, filter) => data.getAllTasks(client, filter))
  ipcMain.handle(IPC.tasksUpsert, (_e, input) => data.upsertTask(client, input))
  ipcMain.handle(
    IPC.tasksReorder,
    (_e, order: { id: string; sort_order: number; stage?: Task['stage'] }[]) =>
      data.reorderTasks(client, order)
  )
  ipcMain.handle(IPC.tasksDelete, (_e, id: string) => data.deleteTask(client, id))

  ipcMain.handle(IPC.sessionsUnassigned, () => data.getUnassignedSessions(client))
  ipcMain.handle(IPC.sessionsAssign, (_e, sessionId: string, projectId: string) =>
    data.assignSession(client, sessionId, projectId)
  )
  ipcMain.handle(IPC.sessionsByProject, (_e, projectId: string) =>
    data.getSessionsByProject(client, projectId)
  )

  ipcMain.handle(IPC.deploymentsList, (_e, projectId: string, limit?: number) =>
    data.getDeployments(client, projectId, limit)
  )
  ipcMain.handle(IPC.repoActivityList, (_e, projectId: string, kind?: 'commit' | 'pr', limit?: number) =>
    data.getRepoActivity(client, projectId, kind, limit)
  )

  ipcMain.handle(IPC.costsList, (_e, filter) => data.getCosts(client, filter))
  ipcMain.handle(IPC.costsUpsert, (_e, input) => data.upsertCost(client, input))
  ipcMain.handle(IPC.costsDelete, (_e, id: string) => data.deleteCost(client, id))

  ipcMain.handle(IPC.accountsList, () => data.getAccounts(client))
  ipcMain.handle(IPC.accountsUpsert, (_e, input) => data.upsertAccount(client, input))
  ipcMain.handle(IPC.accountsDelete, (_e, id: string) => data.deleteAccount(client, id))

  // Chats: import opens a native file picker for the export .zip, parses it in
  // main, upserts (coalesce preserves manual tags), then stamps chats_last_import.
  ipcMain.handle(IPC.chatsImport, async (): Promise<ChatImportResult> => {
    const win = BrowserWindow.getFocusedWindow()
    const opts = {
      title: 'Select Claude data export (.zip)',
      properties: ['openFile' as const],
      filters: [{ name: 'Claude export', extensions: ['zip'] }]
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || res.filePaths.length === 0) {
      const settings = await data.getSettings(client)
      return { imported: 0, canceled: true, last_import: settings.chats_last_import || null }
    }
    const projects = await data.getProjects(client)
    const idleCapRaw = await data.getSetting(client, 'idle_cap_seconds')
    const idleCap = idleCapRaw ? Number(idleCapRaw) : DEFAULT_IDLE_CAP
    const chats = await parseChatExport(res.filePaths[0], projects, idleCap)
    await data.upsertChats(client, chats)
    const ts = new Date().toISOString()
    await data.setSettings(client, { chats_last_import: ts })
    return { imported: chats.length, canceled: false, last_import: ts }
  })
  ipcMain.handle(IPC.chatsList, () => data.getChats(client))
  ipcMain.handle(IPC.chatsUnassigned, () => data.getUnassignedChats(client))
  ipcMain.handle(IPC.chatsAssign, (_e, chatId: string, projectId: string) =>
    data.assignChat(client, chatId, projectId)
  )
  ipcMain.handle(IPC.chatsByProject, (_e, projectId: string) =>
    data.getChatsByProject(client, projectId)
  )

  ipcMain.handle(IPC.syncRun, () => runSync(client))
  ipcMain.handle(IPC.syncStatus, () => getSyncStatus())

  ipcMain.handle(IPC.settingsGet, () => data.getSettings(client))
  ipcMain.handle(IPC.settingsSet, (_e, patch) => data.setSettings(client, patch))

  ipcMain.handle(IPC.updateCheck, () => checkForUpdates())
  ipcMain.handle(IPC.updateInstall, () => quitAndInstall())
  ipcMain.handle(IPC.updateStatus, () => getUpdateStatus())
}
