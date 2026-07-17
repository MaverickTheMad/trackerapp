import { ipcMain } from 'electron'
import type { Client } from '@libsql/client'
import { IPC } from '@shared/ipc'
import type { Task } from '@shared/types'
import * as data from '../db/data'
import { runSync, getSyncStatus } from '../sync'
import { checkForUpdates, quitAndInstall, getUpdateStatus } from '../updater'

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

  ipcMain.handle(IPC.syncRun, () => runSync(client))
  ipcMain.handle(IPC.syncStatus, () => getSyncStatus())

  ipcMain.handle(IPC.settingsGet, () => data.getSettings(client))
  ipcMain.handle(IPC.settingsSet, (_e, patch) => data.setSettings(client, patch))

  ipcMain.handle(IPC.updateCheck, () => checkForUpdates())
  ipcMain.handle(IPC.updateInstall, () => quitAndInstall())
  ipcMain.handle(IPC.updateStatus, () => getUpdateStatus())
}
