import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import type {
  AppSettings,
  ProjectOverview,
  TaskStage,
  TaskWithProject
} from '@shared/types'
import { TaskFormModal } from '../components/TaskFormModal'
import { ago } from '../lib/time'

const STAGES: { key: TaskStage; label: string }[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'shipped', label: 'Shipped' }
]
const STAGE_ORDER: Record<TaskStage, number> = {
  backlog: 0,
  in_progress: 1,
  blocked: 2,
  shipped: 3
}

type Grouping = 'stage' | 'project'
type SortKey = 'age' | 'stage' | 'project'

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86400000
}

// Attention flags are computed here in the renderer from the settings thresholds
// (blocked_days / stuck_days). We have no stage-history table, so "blocked since"
// and "stuck since" are approximated by the task's updated_at — the last time the
// row changed. This over-counts if a blocked/in-progress task was edited for an
// unrelated reason, and under-counts if it sat untouched before entering the
// stage. Good enough as a nudge; documented as an approximation.
function isBlockedTooLong(t: TaskWithProject, s: AppSettings): boolean {
  return t.stage === 'blocked' && daysSince(t.updated_at) > s.blocked_days
}
function isStuck(t: TaskWithProject, s: AppSettings): boolean {
  return t.stage === 'in_progress' && daysSince(t.updated_at) > s.stuck_days
}

export function TaskDashboard(): JSX.Element {
  const [tasks, setTasks] = useState<TaskWithProject[]>([])
  const [projects, setProjects] = useState<ProjectOverview[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<TaskWithProject | null>(null)

  // View controls.
  const [grouping, setGrouping] = useState<Grouping>('stage')
  const [sortKey, setSortKey] = useState<SortKey>('age')
  // Filters — applied server-side via getAllTasks.
  const [projectFilter, setProjectFilter] = useState<string>('')
  const [stageFilter, setStageFilter] = useState<TaskStage | ''>('')
  const [blockedOnly, setBlockedOnly] = useState(false)

  const loadTasks = async (): Promise<void> => {
    const rows = await api.tasks.listAll({
      project_id: projectFilter || undefined,
      stage: stageFilter || undefined,
      blocked_only: blockedOnly || undefined
    })
    setTasks(rows)
  }

  // Projects + settings drive the filter dropdown, the stale banner, and thresholds.
  useEffect(() => {
    void (async () => {
      const [p, s] = await Promise.all([api.projects.list(), api.settings.get()])
      setProjects(p)
      setSettings(s)
    })()
  }, [])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      await loadTasks()
      setLoading(false)
    })()
  }, [projectFilter, stageFilter, blockedOnly])

  const sorted = useMemo(() => {
    const arr = [...tasks]
    if (sortKey === 'age') arr.sort((a, b) => a.created_at.localeCompare(b.created_at)) // oldest first
    else if (sortKey === 'stage') arr.sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage])
    else
      arr.sort((a, b) =>
        (a.project_name ?? '').localeCompare(b.project_name ?? '', undefined, {
          sensitivity: 'base'
        })
      )
    return arr
  }, [tasks, sortKey])

  // Stale projects: no commit/deploy/session activity within stale_days.
  const staleProjects = useMemo(() => {
    if (!settings) return []
    return projects.filter(
      (p) => p.status === 'active' && (!p.last_activity_at || daysSince(p.last_activity_at) > settings.stale_days)
    )
  }, [projects, settings])

  const blockedCount = settings ? tasks.filter((t) => isBlockedTooLong(t, settings)).length : 0
  const stuckCount = settings ? tasks.filter((t) => isStuck(t, settings)).length : 0

  const changeStage = async (t: TaskWithProject, stage: TaskStage): Promise<void> => {
    // upsert preserves the completed_at invariant (stamp on entering 'shipped').
    await api.tasks.upsert({ ...t, stage })
    await loadTasks()
  }

  const saveEdit = async (input: Parameters<typeof api.tasks.upsert>[0]): Promise<void> => {
    await api.tasks.upsert(input)
    setEditing(null)
    await loadTasks()
  }

  const removeTask = async (id: string): Promise<void> => {
    await api.tasks.remove(id)
    setEditing(null)
    await loadTasks()
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tasks</h1>
          <div className="sub">{tasks.length} task{tasks.length === 1 ? '' : 's'} across all projects</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button
            className={`btn ${grouping === 'stage' ? 'primary' : 'ghost'}`}
            onClick={() => setGrouping('stage')}
          >
            By stage
          </button>
          <button
            className={`btn ${grouping === 'project' ? 'primary' : 'ghost'}`}
            onClick={() => setGrouping('project')}
          >
            By project
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <select className="inp" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          className="inp"
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as TaskStage | '')}
          disabled={blockedOnly}
        >
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <label className="row" style={{ gap: 6, fontSize: 13, color: 'var(--text-dim)' }}>
          <input type="checkbox" checked={blockedOnly} onChange={(e) => setBlockedOnly(e.target.checked)} />
          Blocked only
        </label>
        <span style={{ flex: 1 }} />
        <select className="inp" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
          <option value="age">Sort: age</option>
          <option value="stage">Sort: stage</option>
          <option value="project">Sort: project</option>
        </select>
      </div>

      {settings && (blockedCount > 0 || stuckCount > 0 || staleProjects.length > 0) && (
        <div className="banner">
          <strong>Needs attention.</strong>{' '}
          {blockedCount > 0 && (
            <>
              {blockedCount} task{blockedCount === 1 ? '' : 's'} blocked &gt; {settings.blocked_days}d.{' '}
            </>
          )}
          {stuckCount > 0 && (
            <>
              {stuckCount} stuck in progress &gt; {settings.stuck_days}d.{' '}
            </>
          )}
          {staleProjects.length > 0 && (
            <>
              No activity in {settings.stale_days}d:{' '}
              {staleProjects.map((p) => p.name).join(', ')}.
            </>
          )}
        </div>
      )}

      {loading || !settings ? (
        <div className="spin">Loading…</div>
      ) : tasks.length === 0 ? (
        <div className="empty">No tasks match these filters.</div>
      ) : grouping === 'stage' ? (
        <div className="board">
          {STAGES.map((s) => {
            const list = sorted.filter((t) => t.stage === s.key)
            return (
              <div key={s.key} className="column">
                <div className="column-head">
                  <span>{s.label}</span>
                  <span className="count">{list.length}</span>
                </div>
                <div className="column-body">
                  {list.length === 0 ? (
                    <div className="task-meta" style={{ padding: '2px 2px' }}>
                      none
                    </div>
                  ) : (
                    list.map((t) => (
                      <TaskRow
                        key={t.id}
                        t={t}
                        settings={settings}
                        onStage={changeStage}
                        onEdit={() => setEditing(t)}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="two-col">
          {groupByProject(sorted).map(([name, list]) => (
            <section key={name} className="section">
              <h2 className="section-title">
                {name} <span className="count">{list.length}</span>
              </h2>
              <div className="column-body" style={{ padding: 0 }}>
                {list.map((t) => (
                  <TaskRow
                    key={t.id}
                    t={t}
                    settings={settings}
                    onStage={changeStage}
                    onEdit={() => setEditing(t)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <TaskFormModal
          projectId={editing.project_id ?? ''}
          initial={editing}
          onSubmit={saveEdit}
          onCancel={() => setEditing(null)}
          onDelete={() => removeTask(editing.id)}
        />
      )}
    </>
  )
}

// Stable group order: sorted already carries the chosen order, so first-seen wins.
function groupByProject(tasks: TaskWithProject[]): [string, TaskWithProject[]][] {
  const groups = new Map<string, TaskWithProject[]>()
  for (const t of tasks) {
    const key = t.project_name ?? 'No project'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(t)
  }
  return [...groups.entries()]
}

function TaskRow({
  t,
  settings,
  onStage,
  onEdit
}: {
  t: TaskWithProject
  settings: AppSettings
  onStage: (t: TaskWithProject, stage: TaskStage) => void
  onEdit: () => void
}): JSX.Element {
  const blocked = isBlockedTooLong(t, settings)
  const stuck = isStuck(t, settings)
  return (
    <div className="task-card" style={{ cursor: 'default' }}>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <span className="badge">{t.project_name ?? 'No project'}</span>
        <span className="task-title" style={{ flex: 1 }}>
          {t.title}
        </span>
        {blocked && <span className="badge bad">blocked {Math.round(daysSince(t.updated_at))}d</span>}
        {stuck && <span className="badge warn">stuck {Math.round(daysSince(t.updated_at))}d</span>}
      </div>
      <div className="row" style={{ gap: 8, marginTop: 6, alignItems: 'center' }}>
        <select
          className="inp"
          style={{ width: 130, padding: '3px 6px', fontSize: 12 }}
          value={t.stage}
          onChange={(e) => onStage(t, e.target.value as TaskStage)}
        >
          {STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <span className="task-meta" style={{ margin: 0 }}>
          {ago(t.created_at)}
        </span>
        {t.adjust_hours !== 0 && (
          <span className="task-meta" style={{ margin: 0, color: 'var(--accent)' }}>
            {t.adjust_hours > 0 ? '+' : ''}
            {t.adjust_hours}h
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn ghost" style={{ padding: '3px 9px', fontSize: 12 }} onClick={onEdit}>
          Edit
        </button>
      </div>
    </div>
  )
}
