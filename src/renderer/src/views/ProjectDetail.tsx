import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import type {
  ProjectOverview,
  ProjectInput,
  Deployment,
  RepoActivity,
  ClaudeSession,
  Cost,
  CostInput
} from '@shared/types'
import { ProjectFormModal } from '../components/ProjectFormModal'
import { TaskBoard } from '../components/TaskBoard'
import { CostFormModal } from '../components/CostFormModal'

function ago(iso: string): string {
  const secs = (Date.now() - new Date(iso).getTime()) / 1000
  if (secs < 3600) return `${Math.max(1, Math.round(secs / 60))}m ago`
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`
  return `${Math.round(secs / 86400)}d ago`
}

function deployBadge(state: string | null): JSX.Element {
  if (!state) return <span className="badge">—</span>
  const s = state.toUpperCase()
  const cls = s === 'READY' ? 'good' : s === 'ERROR' || s === 'CANCELED' ? 'bad' : 'warn'
  return <span className={`badge ${cls}`}>{s.toLowerCase()}</span>
}

function prState(meta: string | null): string {
  try {
    return meta ? (JSON.parse(meta).state ?? 'open') : 'open'
  } catch {
    return 'open'
  }
}

// Phase 1: project header, metrics, edit/delete. The task board (Phase 3),
// deployments/commits (Phase 2), and Claude hours + cost breakdown (Phases 4–5)
// fill the sections below as those phases land.
export function ProjectDetail({
  projectId,
  onBack
}: {
  projectId: string
  onBack: () => void
}): JSX.Element {
  const [project, setProject] = useState<ProjectOverview | null>(null)
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [commits, setCommits] = useState<RepoActivity[]>([])
  const [prs, setPrs] = useState<RepoActivity[]>([])
  const [sessions, setSessions] = useState<ClaudeSession[]>([])
  const [costs, setCosts] = useState<Cost[]>([])
  const [editing, setEditing] = useState(false)
  const [addingCost, setAddingCost] = useState(false)
  const [editingCost, setEditingCost] = useState<Cost | null>(null)
  const [notFound, setNotFound] = useState(false)

  const load = async (): Promise<void> => {
    const all = await api.projects.list()
    const p = all.find((x) => x.id === projectId) ?? null
    setProject(p)
    setNotFound(!p)
    if (p) {
      const [d, c, pr, ss, cs] = await Promise.all([
        api.deployments.list(projectId, 8),
        api.repoActivity.list(projectId, 'commit', 12),
        api.repoActivity.list(projectId, 'pr', 12),
        api.sessions.byProject(projectId),
        api.costs.list({ project_id: projectId })
      ])
      setDeployments(d)
      setCommits(c)
      setPrs(pr)
      setSessions(ss)
      setCosts(cs)
    }
  }

  useEffect(() => {
    void load()
  }, [projectId])

  const saveEdit = async (input: ProjectInput): Promise<void> => {
    await api.projects.upsert({ ...input, id: projectId })
    setEditing(false)
    await load()
  }

  const saveCost = async (input: CostInput): Promise<void> => {
    await api.costs.upsert(input)
    setAddingCost(false)
    setEditingCost(null)
    await load()
  }

  const removeCost = async (c: Cost): Promise<void> => {
    if (!confirm(`Delete cost "${c.description ?? c.source}"?`)) return
    await api.costs.remove(c.id)
    await load()
  }

  const remove = async (): Promise<void> => {
    if (!confirm(`Delete "${project?.name}"? Tasks are removed; Claude sessions are kept but unassigned.`))
      return
    await api.projects.remove(projectId)
    onBack()
  }

  if (notFound) return <div className="empty">Project not found.</div>
  if (!project) return <div className="spin">Loading…</div>

  return (
    <>
      <div className="page-head">
        <div>
          <button className="btn ghost" onClick={onBack} style={{ marginBottom: 8 }}>
            ← Overview
          </button>
          <h1>{project.name}</h1>
          <div className="sub">
            {project.repo_full_name || 'no repo'} · {project.status}
            {project.claude_cwd ? ` · ${project.claude_cwd}` : ''}
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button className="btn ghost" onClick={remove}>
            Delete
          </button>
        </div>
      </div>

      <div className="metrics" style={{ maxWidth: 520, marginBottom: 26 }}>
        <div className="metric">
          <div className="label">Hours (mo)</div>
          <div className="value">{project.hours_this_month.toFixed(1)}</div>
        </div>
        <div className="metric">
          <div className="label">Cost (mtd)</div>
          <div className="value">${project.cost_month_to_date.toFixed(2)}</div>
          {(project.claude_cost_month_to_date > 0 || project.infra_cost_month_to_date > 0) && (
            <div className="hint" style={{ marginTop: 2 }}>
              ${project.claude_cost_month_to_date.toFixed(2)} claude + $
              {project.infra_cost_month_to_date.toFixed(2)} infra
            </div>
          )}
        </div>
        <div className="metric">
          <div className="label">Open PRs</div>
          <div className="value">{project.open_pr_count}</div>
        </div>
        <div className="metric">
          <div className="label">Latest deploy</div>
          <div className="value" style={{ fontSize: 13 }}>
            {project.latest_deployment_state ?? '—'}
          </div>
        </div>
      </div>

      <Section title="Tasks">
        <TaskBoard projectId={projectId} onChange={load} />
      </Section>

      <Section title="Recent deployments">
        {deployments.length === 0 ? (
          <Muted>
            {project.vercel_project_id
              ? 'No deployments synced yet — hit Refresh on Overview.'
              : 'No Vercel project id set. Add one via Edit.'}
          </Muted>
        ) : (
          <ul className="feed">
            {deployments.map((d) => (
              <li key={d.id}>
                {deployBadge(d.state)}
                <span className="feed-main">
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noreferrer">
                      {d.url.replace(/^https?:\/\//, '')}
                    </a>
                  ) : (
                    d.id
                  )}
                </span>
                <span className="feed-meta">
                  {d.target ?? 'preview'} · {ago(d.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="two-col">
        <Section title={`Recent commits`}>
          {commits.length === 0 ? (
            <Muted>{project.repo_full_name ? 'None synced yet.' : 'No repo set.'}</Muted>
          ) : (
            <ul className="feed">
              {commits.map((c) => (
                <li key={c.id}>
                  <span className="feed-main">{c.title}</span>
                  <span className="feed-meta">
                    {c.author ?? '—'} · {ago(c.occurred_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Recent PRs">
          {prs.length === 0 ? (
            <Muted>{project.repo_full_name ? 'None synced yet.' : 'No repo set.'}</Muted>
          ) : (
            <ul className="feed">
              {prs.map((pr) => {
                const st = prState(pr.meta)
                return (
                  <li key={pr.id}>
                    <span className={`badge ${st === 'open' ? 'good' : st === 'merged' ? '' : 'warn'}`}>
                      {st}
                    </span>
                    <span className="feed-main">{pr.title}</span>
                    <span className="feed-meta">
                      {pr.author ?? '—'} · {ago(pr.occurred_at)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Claude hours & cost (all-time)">
        <ClaudePanel sessions={sessions} hasCwd={!!project.claude_cwd} />
      </Section>

      <Section title="Cost breakdown">
        <div style={{ marginBottom: 8 }}>
          <button className="btn" style={{ padding: '5px 11px' }} onClick={() => setAddingCost(true)}>
            + Add cost
          </button>
        </div>
        {costs.length === 0 ? (
          <Muted>No costs recorded for this project yet.</Muted>
        ) : (
          <ul className="feed">
            {costs.map((c) => (
              <li key={c.id}>
                <span className="badge">{c.source}</span>
                <span className="feed-main">
                  {c.description ?? '—'}
                  {c.recurring ? ' · ↻ monthly' : ''}
                </span>
                <span className="feed-meta">
                  {(c.period_start ?? c.created_at).slice(0, 7)} · ${c.amount_usd.toFixed(2)}
                </span>
                <button
                  className="btn ghost"
                  style={{ padding: '2px 6px' }}
                  onClick={() => setEditingCost(c)}
                >
                  edit
                </button>
                <button
                  className="btn ghost"
                  style={{ padding: '2px 6px', color: 'var(--bad)' }}
                  onClick={() => removeCost(c)}
                >
                  ✕
                </button>
              </li>
            ))}
            <li>
              <span className="feed-main" style={{ color: 'var(--text-dim)' }}>
                Total
              </span>
              <span className="feed-meta mono">
                ${costs.reduce((s, c) => s + c.amount_usd, 0).toFixed(2)}
              </span>
            </li>
          </ul>
        )}
      </Section>

      {(addingCost || editingCost) && (
        <CostFormModal
          projects={[project]}
          defaultProjectId={projectId}
          initial={editingCost ?? undefined}
          onSubmit={saveCost}
          onCancel={() => {
            setAddingCost(false)
            setEditingCost(null)
          }}
        />
      )}

      {editing && (
        <ProjectFormModal
          title="Edit project"
          initial={project}
          onSubmit={saveEdit}
          onCancel={() => setEditing(false)}
        />
      )}
    </>
  )
}

function PhaseStub({ title, phase }: { title: string; phase: string }): JSX.Element {
  return (
    <div className="empty" style={{ padding: 22, marginBottom: 12, textAlign: 'left' }}>
      <strong>{title}</strong> — arrives in {phase}.
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="section">
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  )
}

function Muted({ children }: { children: ReactNode }): JSX.Element {
  return <div className="spin" style={{ padding: '6px 0' }}>{children}</div>
}

function ClaudePanel({
  sessions,
  hasCwd
}: {
  sessions: ClaudeSession[]
  hasCwd: boolean
}): JSX.Element {
  if (sessions.length === 0) {
    return (
      <Muted>
        {hasCwd
          ? 'No Claude sessions matched this project yet — hit Refresh, or assign sessions from the Overview banner.'
          : 'Set this project’s claude_cwd (Edit) so sessions match, or assign them from the Overview banner.'}
      </Muted>
    )
  }
  const hours = sessions.reduce((s, x) => s + x.active_seconds, 0) / 3600
  const cost = sessions.reduce((s, x) => s + x.est_cost_usd, 0)
  const tokens = sessions.reduce(
    (s, x) => s + x.input_tokens + x.output_tokens + x.cache_read_tokens + x.cache_creation_tokens,
    0
  )
  return (
    <>
      <div className="metrics" style={{ maxWidth: 560, marginBottom: 14 }}>
        <div className="metric">
          <div className="label">Sessions</div>
          <div className="value">{sessions.length}</div>
        </div>
        <div className="metric">
          <div className="label">Hours</div>
          <div className="value">{hours.toFixed(1)}</div>
        </div>
        <div className="metric">
          <div className="label">Est. cost</div>
          <div className="value">${cost.toFixed(2)}</div>
        </div>
        <div className="metric">
          <div className="label">Tokens</div>
          <div className="value">{(tokens / 1e6).toFixed(1)}M</div>
        </div>
      </div>
      <ul className="feed">
        {sessions.slice(0, 10).map((s) => (
          <li key={s.id}>
            <span className="badge">{s.model ?? 'unknown'}</span>
            <span className="feed-main">{s.started_at.slice(0, 10)}</span>
            <span className="feed-meta">
              {(s.active_seconds / 3600).toFixed(1)}h · ${s.est_cost_usd.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
