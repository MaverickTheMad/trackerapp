import { useEffect, useState } from 'react'
import { api } from './lib/api'
import type { SyncStatus } from '@shared/types'
import { Overview } from './views/Overview'
import { ProjectDetail } from './views/ProjectDetail'
import { TaskDashboard } from './views/TaskDashboard'
import { Chats } from './views/Chats'
import { Costs } from './views/Costs'
import { Settings } from './views/Settings'

type View = 'overview' | 'tasks' | 'chats' | 'costs' | 'settings' | 'project'

export default function App(): JSX.Element {
  const [view, setView] = useState<View>('overview')
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [sync, setSync] = useState<SyncStatus | null>(null)

  // Poll sync status so the header reflects background runs (launch + timer).
  useEffect(() => {
    let alive = true
    const tick = async (): Promise<void> => {
      try {
        const s = await api.sync.status()
        if (alive) setSync(s)
      } catch {
        /* main not ready yet */
      }
    }
    void tick()
    const h = setInterval(tick, 2000)
    return () => {
      alive = false
      clearInterval(h)
    }
  }, [])

  const openProject = (id: string): void => {
    setActiveProjectId(id)
    setView('project')
  }

  const nav = (v: View): void => {
    setActiveProjectId(null)
    setView(v)
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          Project Tracker
          <small>desktop command center</small>
        </div>
        <button
          className={`nav-item ${view === 'overview' ? 'active' : ''}`}
          onClick={() => nav('overview')}
        >
          ▦ Overview
        </button>
        <button
          className={`nav-item ${view === 'tasks' ? 'active' : ''}`}
          onClick={() => nav('tasks')}
        >
          ☑ Tasks
        </button>
        <button
          className={`nav-item ${view === 'chats' ? 'active' : ''}`}
          onClick={() => nav('chats')}
        >
          ✎ Chats
        </button>
        <button
          className={`nav-item ${view === 'costs' ? 'active' : ''}`}
          onClick={() => nav('costs')}
        >
          ＄ Costs
        </button>
        <button
          className={`nav-item ${view === 'settings' ? 'active' : ''}`}
          onClick={() => nav('settings')}
        >
          ⚙ Settings
        </button>
        <div className="sidebar-footer">
          {sync?.phase === 'running'
            ? 'Syncing…'
            : sync?.last_run_at
              ? `Synced ${new Date(sync.last_run_at).toLocaleTimeString()}`
              : 'Not synced yet'}
        </div>
      </aside>

      <main className="main">
        {view === 'overview' && <Overview onOpenProject={openProject} sync={sync} />}
        {view === 'tasks' && <TaskDashboard />}
        {view === 'chats' && <Chats />}
        {view === 'project' && activeProjectId && (
          <ProjectDetail projectId={activeProjectId} onBack={() => nav('overview')} />
        )}
        {view === 'costs' && <Costs />}
        {view === 'settings' && <Settings />}
      </main>
    </div>
  )
}
