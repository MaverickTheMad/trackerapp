import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { ProjectOverview, ProjectInput, SyncStatus, ClaudeSession } from '@shared/types'
import { ProjectFormModal } from '../components/ProjectFormModal'
import { UnassignedSessions } from '../components/UnassignedSessions'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Relative age of an ISO timestamp (same shape as ProjectDetail's `ago`).
function ago(iso: string): string {
  const secs = (Date.now() - new Date(iso).getTime()) / 1000
  if (secs < 3600) return `${Math.max(1, Math.round(secs / 60))}m ago`
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`
  return `${Math.round(secs / 86400)}d ago`
}

function stateBadge(state: string | null): JSX.Element {
  if (!state) return <span className="badge">no deploys</span>
  const s = state.toUpperCase()
  const cls = s === 'READY' ? 'good' : s === 'ERROR' ? 'bad' : 'warn'
  return <span className={`badge ${cls}`}>{s.toLowerCase()}</span>
}

export function Overview({
  onOpenProject,
  sync
}: {
  onOpenProject: (id: string) => void
  sync: SyncStatus | null
}): JSX.Element {
  const [projects, setProjects] = useState<ProjectOverview[]>([])
  const [unassigned, setUnassigned] = useState<ClaudeSession[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [showUnassigned, setShowUnassigned] = useState(false)

  const load = async (): Promise<void> => {
    const [p, u] = await Promise.all([api.projects.list(), api.sessions.unassigned()])
    setProjects(p)
    setUnassigned(u)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  // Reload when a background sync finishes.
  useEffect(() => {
    if (sync?.phase === 'idle') void load()
  }, [sync?.last_run_at])

  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      await api.sync.run()
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  const createProject = async (input: ProjectInput): Promise<void> => {
    await api.projects.upsert({ ...input, slug: input.slug || slugify(input.name) })
    setShowAdd(false)
    await load()
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <div className="sub">
            {projects.length} project{projects.length === 1 ? '' : 's'} · hours & cost are
            month-to-date
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : '↻ Refresh'}
          </button>
          <button className="btn primary" onClick={() => setShowAdd(true)}>
            + Add project
          </button>
        </div>
      </div>

      {unassigned.length > 0 && (
        <div className="banner">
          {unassigned.length} unassigned Claude session{unassigned.length === 1 ? '' : 's'} — their{' '}
          <span className="mono">cwd</span> matched no project.{' '}
          <button
            className="btn ghost"
            style={{ padding: '2px 8px', color: 'var(--accent)' }}
            onClick={() => setShowUnassigned(true)}
          >
            Assign them →
          </button>
        </div>
      )}

      {loading ? (
        <div className="spin">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="empty">
          No projects yet. Click <strong>Add project</strong> to create your first one.
        </div>
      ) : (
        <>
          <GlobalStrip projects={projects} />
          <div className="card-grid">
            {projects.map((p) => (
              <ProjectCard key={p.id} p={p} onOpen={() => onOpenProject(p.id)} />
            ))}
          </div>
        </>
      )}

      {showAdd && (
        <ProjectFormModal
          title="Add project"
          onCancel={() => setShowAdd(false)}
          onSubmit={createProject}
        />
      )}

      {showUnassigned && (
        <UnassignedSessions
          projects={projects}
          onClose={() => setShowUnassigned(false)}
          onAssigned={load}
        />
      )}
    </>
  )
}

// Global strip: every figure is summed/counted from the per-project overview
// list — no separate IPC call needed.
function GlobalStrip({ projects }: { projects: ProjectOverview[] }): JSX.Element {
  const activeCount = projects.filter((p) => p.status === 'active').length
  const openTasks = projects.reduce((s, p) => s + p.open_task_count, 0)
  const blocked = projects.reduce((s, p) => s + p.blocked_count, 0)
  const spend = projects.reduce((s, p) => s + p.cost_month_to_date, 0)
  const hoursWeek = projects.reduce((s, p) => s + p.hours_this_week, 0)

  return (
    <div
      className="metrics"
      style={{
        gridTemplateColumns: 'repeat(5, 1fr)',
        maxWidth: 720,
        marginTop: 0,
        marginBottom: 18
      }}
    >
      <div className="metric">
        <div className="label">Active projects</div>
        <div className="value">{activeCount}</div>
      </div>
      <div className="metric">
        <div className="label">Open tasks</div>
        <div className="value">{openTasks}</div>
      </div>
      <div className="metric">
        <div className="label">Blocked</div>
        <div className="value" style={blocked > 0 ? { color: 'var(--bad)' } : undefined}>
          {blocked}
        </div>
      </div>
      <div className="metric">
        <div className="label">Spend (mtd)</div>
        <div className="value">${spend.toFixed(2)}</div>
      </div>
      <div className="metric">
        <div className="label">Hours (wk)</div>
        <div className="value">{hoursWeek.toFixed(1)}</div>
      </div>
    </div>
  )
}

function ProjectCard({ p, onOpen }: { p: ProjectOverview; onOpen: () => void }): JSX.Element {
  return (
    <div className="card" onClick={onOpen} style={{ cursor: 'pointer' }}>
      <div className="card-top">
        <div>
          <h3>{p.name}</h3>
          {p.repo_full_name && <div className="repo">{p.repo_full_name}</div>}
        </div>
        {stateBadge(p.latest_deployment_state)}
      </div>

      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        <span className="badge">{p.backlog_count} backlog</span>
        <span className="badge">{p.in_progress_count} in progress</span>
        {p.blocked_count > 0 && <span className="badge bad">{p.blocked_count} blocked</span>}
        {p.production_deploy_failed && <span className="badge bad">prod deploy failed</span>}
        {(p.needs_github_account || p.needs_vercel_account) && (
          <span className="badge warn">needs account</span>
        )}
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="label">Open PRs</div>
          <div className="value">{p.open_pr_count}</div>
        </div>
        <div className="metric">
          <div className="label">Oldest in progress</div>
          <div className="value" style={{ fontSize: 13 }}>
            {p.oldest_in_progress_at ? ago(p.oldest_in_progress_at) : '—'}
          </div>
        </div>
        <div className="metric">
          <div className="label">Hours (wk / mo)</div>
          <div className="value">
            {p.hours_this_week.toFixed(1)} / {p.hours_this_month.toFixed(1)}
          </div>
        </div>
        <div className="metric">
          <div className="label">Cost (mtd)</div>
          <div className="value">${p.cost_month_to_date.toFixed(2)}</div>
        </div>
        <div className="metric">
          <div className="label">Last activity</div>
          <div className="value" style={{ fontSize: 13 }}>
            {p.last_activity_at ? ago(p.last_activity_at) : '—'}
          </div>
        </div>
        <div className="metric">
          <div className="label">Status</div>
          <div className="value" style={{ fontSize: 13 }}>
            {p.status}
          </div>
        </div>
      </div>
    </div>
  )
}
