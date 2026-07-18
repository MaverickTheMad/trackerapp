// Canonical IPC channel names. Renderer and main both import from here so the
// wire contract has a single source of truth. Keep thin: every channel maps to
// exactly one data-module or sync call.

export const IPC = {
  projectsList: 'projects:list',
  projectsUpsert: 'projects:upsert',
  projectsDelete: 'projects:delete',

  tasksList: 'tasks:list',
  tasksListAll: 'tasks:listAll',
  tasksUpsert: 'tasks:upsert',
  tasksReorder: 'tasks:reorder',
  tasksDelete: 'tasks:delete',

  sessionsUnassigned: 'sessions:unassigned',
  sessionsAssign: 'sessions:assign',
  sessionsByProject: 'sessions:byProject',

  deploymentsList: 'deployments:list',
  repoActivityList: 'repo:list',

  costsList: 'costs:list',
  costsUpsert: 'costs:upsert',
  costsDelete: 'costs:delete',

  accountsList: 'accounts:list',
  accountsUpsert: 'accounts:upsert',
  accountsDelete: 'accounts:delete',

  chatsImport: 'chats:import',
  chatsList: 'chats:list',
  chatsUnassigned: 'chats:unassigned',
  chatsAssign: 'chats:assign',
  chatsByProject: 'chats:byProject',

  syncRun: 'sync:run',
  syncStatus: 'sync:status',

  settingsGet: 'settings:get',
  settingsSet: 'settings:set',

  updateCheck: 'update:check',
  updateInstall: 'update:install',
  updateStatus: 'update:status',
  updateEvent: 'update:event' // main → renderer push
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
