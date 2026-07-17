import type {
  ProjectInput,
  ProjectOverview,
  Task,
  TaskInput,
  ClaudeSession,
  Cost,
  CostInput,
  SyncStatus,
  AppSettings,
  Project,
  Deployment,
  RepoActivity,
  UpdateStatus
} from '@shared/types'

// Typed facade over the untyped window.api bridge. Views import from here so the
// renderer gets full type-checking without ever knowing IPC exists underneath.
const raw = window.api

type SettingsPatch = Partial<Record<keyof AppSettings, string | number>>

export const api = {
  projects: {
    list: (): Promise<ProjectOverview[]> => raw.projects.list(),
    upsert: (input: ProjectInput): Promise<Project> => raw.projects.upsert(input),
    remove: (id: string): Promise<void> => raw.projects.remove(id)
  },
  tasks: {
    list: (projectId: string): Promise<Task[]> => raw.tasks.list(projectId),
    upsert: (input: TaskInput): Promise<Task> => raw.tasks.upsert(input),
    reorder: (order: { id: string; sort_order: number; stage?: Task['stage'] }[]): Promise<void> =>
      raw.tasks.reorder(order),
    remove: (id: string): Promise<void> => raw.tasks.remove(id)
  },
  sessions: {
    unassigned: (): Promise<ClaudeSession[]> => raw.sessions.unassigned(),
    assign: (sessionId: string, projectId: string): Promise<void> =>
      raw.sessions.assign(sessionId, projectId),
    byProject: (projectId: string): Promise<ClaudeSession[]> => raw.sessions.byProject(projectId)
  },
  deployments: {
    list: (projectId: string, limit?: number): Promise<Deployment[]> =>
      raw.deployments.list(projectId, limit)
  },
  repoActivity: {
    list: (projectId: string, kind?: 'commit' | 'pr', limit?: number): Promise<RepoActivity[]> =>
      raw.repoActivity.list(projectId, kind, limit)
  },
  costs: {
    list: (filter?: { month?: string; source?: string; project_id?: string }): Promise<Cost[]> =>
      raw.costs.list(filter),
    upsert: (input: CostInput): Promise<Cost> => raw.costs.upsert(input),
    remove: (id: string): Promise<void> => raw.costs.remove(id)
  },
  sync: {
    run: (): Promise<SyncStatus> => raw.sync.run(),
    status: (): Promise<SyncStatus> => raw.sync.status()
  },
  settings: {
    get: (): Promise<AppSettings> => raw.settings.get(),
    set: (patch: SettingsPatch): Promise<AppSettings> => raw.settings.set(patch)
  },
  update: {
    check: (): Promise<UpdateStatus> => raw.update.check(),
    install: (): Promise<void> => raw.update.install(),
    status: (): Promise<UpdateStatus> => raw.update.status(),
    onEvent: (cb: (status: UpdateStatus) => void): (() => void) => raw.update.onEvent(cb)
  }
}
