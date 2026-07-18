import { useEffect, useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend
} from 'recharts'
import { api } from '../lib/api'
import type { MetricsWeek, ProjectOverview, WeeklyDigest } from '@shared/types'

// Monday-UTC week start for a Date (mirrors the server's week logic).
function mondayUtc(d: Date): string {
  const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const daysSinceMonday = (u.getUTCDay() + 6) % 7
  u.setUTCDate(u.getUTCDate() - daysSinceMonday)
  return u.toISOString().slice(0, 10)
}
function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
// Last N Mondays (oldest→newest), for the digest week selector.
function recentWeekStarts(n: number): string[] {
  const cur = mondayUtc(new Date())
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) out.push(addDaysYmd(cur, -7 * i))
  return out
}

const CHART_HEIGHT = 220

export function Insights(): JSX.Element {
  const [projects, setProjects] = useState<ProjectOverview[]>([])
  const [projectId, setProjectId] = useState<string>('') // '' = all projects
  const [weekly, setWeekly] = useState<MetricsWeek[]>([])
  const [weekStart, setWeekStart] = useState<string>(mondayUtc(new Date()))
  const [digest, setDigest] = useState<WeeklyDigest | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void api.projects.list().then(setProjects)
  }, [])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      const w = await api.metrics.weekly(projectId ? { project_id: projectId } : {})
      setWeekly(w)
      setLoading(false)
    })()
  }, [projectId])

  useEffect(() => {
    setCopied(false)
    void api.metrics.digest(weekStart, projectId || undefined).then(setDigest)
  }, [weekStart, projectId])

  // Shorten YYYY-MM-DD → MM-DD for axis labels.
  const chartData = useMemo(
    () =>
      weekly.map((w) => ({
        week: w.week_start.slice(5),
        code: Number(w.code_hours.toFixed(2)),
        chat: Number(w.chat_hours.toFixed(2)),
        cost: Number(w.claude_cost_usd.toFixed(2)),
        tasks: w.tasks_completed,
        deploys: w.deploys
      })),
    [weekly]
  )

  const copyMarkdown = async (): Promise<void> => {
    if (!digest) return
    await navigator.clipboard.writeText(digestToMarkdown(digest, projectLabel(projects, projectId)))
    setCopied(true)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Insights</h1>
          <div className="sub">
            Weekly trends (Monday–Sunday, UTC). Hours &amp; Claude cost only — infra costs stay
            monthly on Costs.
          </div>
        </div>
        <div className="row">
          <select className="inp" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="spin">Loading…</div>
      ) : weekly.length === 0 ? (
        <div className="empty">
          No metrics yet. Metrics accrue from synced sessions, chats, tasks and deploys — run a sync
          (Refresh on Overview) and check back.
        </div>
      ) : (
        <div className="two-col">
          <ChartCard title="Hours — code vs chat (stacked)">
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <BarChart data={chartData} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'var(--text-faint)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-faint)' }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="code" stackId="h" fill="var(--accent)" name="code" />
                <Bar dataKey="chat" stackId="h" fill="var(--warn)" name="chat" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Claude cost ($/week)">
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart data={chartData} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'var(--text-faint)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-faint)' }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="cost" stroke="var(--good)" dot={false} name="$" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Tasks completed">
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <BarChart data={chartData} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'var(--text-faint)' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-faint)' }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="tasks" fill="var(--accent)" name="tasks" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Deploys">
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <BarChart data={chartData} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'var(--text-faint)' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-faint)' }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="deploys" fill="var(--good)" name="deploys" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      <section className="section" style={{ marginTop: 26 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            Weekly digest
          </h2>
          <div className="row" style={{ gap: 8 }}>
            <select className="inp" value={weekStart} onChange={(e) => setWeekStart(e.target.value)}>
              {recentWeekStarts(12)
                .slice()
                .reverse()
                .map((w) => (
                  <option key={w} value={w}>
                    {w} – {addDaysYmd(w, 6)}
                  </option>
                ))}
            </select>
            <button className="btn" onClick={copyMarkdown} disabled={!digest}>
              {copied ? 'Copied ✓' : 'Copy as markdown'}
            </button>
          </div>
        </div>
        {digest ? <DigestPanel digest={digest} /> : <div className="spin">Loading digest…</div>}
      </section>
    </>
  )
}

const tooltipStyle = {
  background: 'var(--bg-elev-2)',
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  fontSize: 12
}

function ChartCard({ title, children }: { title: string; children: JSX.Element }): JSX.Element {
  return (
    <section className="section">
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  )
}

function DigestPanel({ digest }: { digest: WeeklyDigest }): JSX.Element {
  return (
    <div>
      <div className="metrics" style={{ maxWidth: 620, marginBottom: 18 }}>
        <div className="metric">
          <div className="label">Claude cost</div>
          <div className="value">${digest.total_claude_cost_usd.toFixed(2)}</div>
        </div>
        <div className="metric">
          <div className="label">Tasks done / opened</div>
          <div className="value">
            {digest.tasks_completed} / {digest.tasks_opened}
          </div>
        </div>
        <div className="metric">
          <div className="label">Shipped (prod)</div>
          <div className="value">{digest.shipped.length}</div>
        </div>
        <div className="metric">
          <div className="label">Stuck / blocked</div>
          <div className="value" style={digest.stuck_tasks.length ? { color: 'var(--bad)' } : undefined}>
            {digest.stuck_tasks.length}
          </div>
        </div>
      </div>

      <h3 style={{ fontSize: 13, margin: '10px 0 6px' }}>Shipped to production</h3>
      {digest.shipped.length === 0 ? (
        <div className="spin" style={{ padding: '2px 0' }}>
          Nothing shipped to production this week.
        </div>
      ) : (
        <ul className="feed">
          {digest.shipped.map((s) => (
            <li key={s.deployment_id}>
              <span className="badge good">{s.project_name ?? '—'}</span>
              <span className="feed-main">
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.url.replace(/^https?:\/\//, '')}
                  </a>
                ) : (
                  s.deployment_id
                )}
              </span>
              <span className="feed-meta">{s.created_at.slice(0, 10)}</span>
            </li>
          ))}
        </ul>
      )}

      <h3 style={{ fontSize: 13, margin: '16px 0 6px' }}>Hours by project</h3>
      {digest.hours_by_project.length === 0 ? (
        <div className="spin" style={{ padding: '2px 0' }}>
          No tracked hours this week.
        </div>
      ) : (
        <ul className="feed">
          {digest.hours_by_project.map((h) => (
            <li key={h.project_id}>
              <span className="feed-main">{h.project_name ?? h.project_id}</span>
              <span className="feed-meta mono">
                {h.code_hours.toFixed(1)}h code · {h.chat_hours.toFixed(1)}h chat
              </span>
            </li>
          ))}
        </ul>
      )}

      {digest.stuck_tasks.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, margin: '16px 0 6px' }}>Still stuck / blocked</h3>
          <ul className="feed">
            {digest.stuck_tasks.map((t) => (
              <li key={t.id}>
                <span className={`badge ${t.stage === 'blocked' ? 'bad' : 'warn'}`}>
                  {t.stage.replace('_', ' ')}
                </span>
                <span className="feed-main">{t.title}</span>
                <span className="feed-meta">
                  {t.project_name ?? '—'} · {t.days}d
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function projectLabel(projects: ProjectOverview[], projectId: string): string {
  if (!projectId) return 'All projects'
  return projects.find((p) => p.id === projectId)?.name ?? projectId
}

// Deterministic markdown serialization for pasting into an async update.
function digestToMarkdown(d: WeeklyDigest, scope: string): string {
  const lines: string[] = []
  lines.push(`# Weekly digest — ${d.week_start} to ${d.week_end}`)
  lines.push(`_Scope: ${scope}_`)
  lines.push('')
  lines.push(
    `- Claude cost: $${d.total_claude_cost_usd.toFixed(2)}`,
    `- Tasks completed: ${d.tasks_completed} · opened: ${d.tasks_opened}`,
    `- Shipped to production: ${d.shipped.length}`,
    `- Currently stuck/blocked: ${d.stuck_tasks.length}`
  )
  lines.push('')
  lines.push('## Shipped to production')
  if (d.shipped.length === 0) lines.push('- (nothing shipped)')
  else
    for (const s of d.shipped)
      lines.push(
        `- ${s.project_name ?? '—'}: ${s.url ?? s.deployment_id} (${s.created_at.slice(0, 10)})`
      )
  lines.push('')
  lines.push('## Hours by project')
  if (d.hours_by_project.length === 0) lines.push('- (no tracked hours)')
  else
    for (const h of d.hours_by_project)
      lines.push(
        `- ${h.project_name ?? h.project_id}: ${h.code_hours.toFixed(1)}h code, ${h.chat_hours.toFixed(1)}h chat`
      )
  if (d.stuck_tasks.length > 0) {
    lines.push('')
    lines.push('## Still stuck / blocked')
    for (const t of d.stuck_tasks)
      lines.push(`- [${t.stage.replace('_', ' ')}] ${t.title} — ${t.project_name ?? '—'} (${t.days}d)`)
  }
  return lines.join('\n')
}
