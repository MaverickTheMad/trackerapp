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
        <div className="card-grid">
          {projects.map((p) => (
            <ProjectCard key={p.id} p={p} onOpen={() => onOpenProject(p.id)} />
          ))}
        </div>
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
      <div className="metrics">
        <div className="metric">
          <div className="label">Open PRs</div>
          <div className="value">{p.open_pr_count}</div>
        </div>
        <div className="metric">
          <div className="label">Status</div>
          <div className="value" style={{ fontSize: 13 }}>
            {p.status}
          </div>
        </div>
        <div className="metric">
          <div className="label">Hours (mo)</div>
          <div className="value">{p.hours_this_month.toFixed(1)}</div>
        </div>
        <div className="metric">
          <div className="label">Cost (mtd)</div>
          <div className="value">${p.cost_month_to_date.toFixed(2)}</div>
        </div>
      </div>
    </div>
  )
}
