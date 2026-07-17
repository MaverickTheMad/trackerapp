import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  ProjectInput,
  TaskInput,
  CostInput,
  Task,
  AppSettings,
  UpdateStatus,
  AccountInput
} from '@shared/types'

// The single, typed surface the renderer is allowed to touch. No SQL, no client,
// no Node APIs cross this boundary — only these calls, each a thin IPC invoke.
const api = {
  projects: {
    list: () => ipcRenderer.invoke(IPC.projectsList),
    upsert: (input: ProjectInput) => ipcRenderer.invoke(IPC.projectsUpsert, input),
    remove: (id: string) => ipcRenderer.invoke(IPC.projectsDelete, id)
  },
  tasks: {
    list: (projectId: string) => ipcRenderer.invoke(IPC.tasksList, projectId),
    listAll: (filter?: { project_id?: string; stage?: Task['stage']; blocked_only?: boolean }) =>
      ipcRenderer.invoke(IPC.tasksListAll, filter),
    upsert: (input: TaskInput) => ipcRenderer.invoke(IPC.tasksUpsert, input),
    reorder: (order: { id: string; sort_order: number; stage?: Task['stage'] }[]) =>
      ipcRenderer.invoke(IPC.tasksReorder, order),
    remove: (id: string) => ipcRenderer.invoke(IPC.tasksDelete, id)
  },
  sessions: {
    unassigned: () => ipcRenderer.invoke(IPC.sessionsUnassigned),
    assign: (sessionId: string, projectId: string) =>
      ipcRenderer.invoke(IPC.sessionsAssign, sessionId, projectId),
    byProject: (projectId: string) => ipcRenderer.invoke(IPC.sessionsByProject, projectId)
  },
  deployments: {
    list: (projectId: string, limit?: number) =>
      ipcRenderer.invoke(IPC.deploymentsList, projectId, limit)
  },
  repoActivity: {
    list: (projectId: string, kind?: 'commit' | 'pr', limit?: number) =>
      ipcRenderer.invoke(IPC.repoActivityList, projectId, kind, limit)
  },
  costs: {
    list: (filter?: { month?: string; source?: string; project_id?: string }) =>
      ipcRenderer.invoke(IPC.costsList, filter),
    upsert: (input: CostInput) => ipcRenderer.invoke(IPC.costsUpsert, input),
    remove: (id: string) => ipcRenderer.invoke(IPC.costsDelete, id)
  },
  accounts: {
    list: () => ipcRenderer.invoke(IPC.accountsList),
    upsert: (input: AccountInput) => ipcRenderer.invoke(IPC.accountsUpsert, input),
    remove: (id: string) => ipcRenderer.invoke(IPC.accountsDelete, id)
  },
  sync: {
    run: () => ipcRenderer.invoke(IPC.syncRun),
    status: () => ipcRenderer.invoke(IPC.syncStatus)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch: Partial<Record<keyof AppSettings, string | number>>) =>
      ipcRenderer.invoke(IPC.settingsSet, patch)
  },
  update: {
    check: () => ipcRenderer.invoke(IPC.updateCheck),
    install: () => ipcRenderer.invoke(IPC.updateInstall),
    status: () => ipcRenderer.invoke(IPC.updateStatus),
    // Subscribe to main→renderer push events; returns an unsubscribe fn.
    onEvent: (cb: (status: UpdateStatus) => void) => {
      const handler = (_e: IpcRendererEvent, status: UpdateStatus): void => cb(status)
      ipcRenderer.on(IPC.updateEvent, handler)
      return () => ipcRenderer.removeListener(IPC.updateEvent, handler)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type TrackerApi = typeof api
