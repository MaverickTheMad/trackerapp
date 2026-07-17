import { randomUUID } from 'crypto'
import type { Client, Row } from '@libsql/client'
import type {
  Project,
  ProjectInput,
  ProjectOverview,
  Task,
  TaskInput,
  ClaudeSession,
  Deployment,
  RepoActivity,
  Cost,
  CostInput,
  AppSettings
} from '@shared/types'

// ── The data module ─────────────────────────────────────────────────────────
// Every exported function takes the libSQL `client` as its first argument rather
// than importing a singleton. The desktop main process passes a local-file client;
// the future read-only web app imports THIS SAME FILE and passes a Turso remote
// client. The React renderer never imports this — it only speaks IPC. Do not add
// Electron/Node-desktop imports here; keep it environment-neutral.

const now = (): string => new Date().toISOString()

// ── Row mappers (SQLite 0/1 -> boolean, null coercion, numeric widening) ──────
function toNum(v: unknown): number {
  return v == null ? 0 : Number(v)
}
function toStr(v: unknown): string | null {
  return v == null ? null : String(v)
}

function mapProject(r: Row): Project {
  return {
    id: String(r.id),
    name: String(r.name),
    slug: String(r.slug),
    repo_full_name: toStr(r.repo_full_name),
    vercel_project_id: toStr(r.vercel_project_id),
    neon_project_id: toStr(r.neon_project_id),
    claude_cwd: toStr(r.claude_cwd),
    status: String(r.status) as Project['status'],
    created_at: String(r.created_at),
    updated_at: String(r.updated_at)
  }
}

function mapTask(r: Row): Task {
  return {
    id: String(r.id),
    project_id: toStr(r.project_id),
    title: String(r.title),
    description: toStr(r.description),
    stage: String(r.stage) as Task['stage'],
    estimate_hours: r.estimate_hours == null ? null : Number(r.estimate_hours),
    adjust_hours: toNum(r.adjust_hours),
    sort_order: toNum(r.sort_order),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    completed_at: toStr(r.completed_at)
  }
}

function mapSession(r: Row): ClaudeSession {
  return {
    id: String(r.id),
    project_id: toStr(r.project_id),
    claude_cwd: toStr(r.claude_cwd),
    model: toStr(r.model),
    started_at: String(r.started_at),
    ended_at: String(r.ended_at),
    active_seconds: toNum(r.active_seconds),
    input_tokens: toNum(r.input_tokens),
    output_tokens: toNum(r.output_tokens),
    cache_read_tokens: toNum(r.cache_read_tokens),
    cache_creation_tokens: toNum(r.cache_creation_tokens),
    est_cost_usd: toNum(r.est_cost_usd),
    ingested_at: String(r.ingested_at)
  }
}

function mapDeployment(r: Row): Deployment {
  return {
    id: String(r.id),
    project_id: String(r.project_id),
    target: toStr(r.target),
    state: toStr(r.state),
    url: toStr(r.url),
    created_at: String(r.created_at),
    meta: toStr(r.meta)
  }
}

function mapRepoActivity(r: Row): RepoActivity {
  return {
    id: String(r.id),
    project_id: String(r.project_id),
    kind: String(r.kind) as RepoActivity['kind'],
    title: toStr(r.title),
    author: toStr(r.author),
    occurred_at: String(r.occurred_at),
    meta: toStr(r.meta)
  }
}

function mapCost(r: Row): Cost {
  return {
    id: String(r.id),
    project_id: toStr(r.project_id),
    source: String(r.source) as Cost['source'],
    description: toStr(r.description),
    amount_usd: toNum(r.amount_usd),
    period_start: toStr(r.period_start),
    period_end: toStr(r.period_end),
    recurring: Number(r.recurring) === 1,
    created_at: String(r.created_at)
  }
}

// ── Projects ─────────────────────────────────────────────────────────────────
export async function getProjects(client: Client): Promise<Project[]> {
  const res = await client.execute('select * from projects order by name collate nocase')
  return res.rows.map(mapProject)
}

export async function getProject(client: Client, id: string): Promise<Project | null> {
  const res = await client.execute({ sql: 'select * from projects where id = ?', args: [id] })
  return res.rows[0] ? mapProject(res.rows[0]) : null
}

export async function upsertProject(client: Client, input: ProjectInput): Promise<Project> {
  const id = input.id ?? randomUUID()
  const ts = now()
  await client.execute({
    sql: /* sql */ `
      insert into projects
        (id, name, slug, repo_full_name, vercel_project_id, neon_project_id,
         claude_cwd, status, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        name = excluded.name,
        slug = excluded.slug,
        repo_full_name = excluded.repo_full_name,
        vercel_project_id = excluded.vercel_project_id,
        neon_project_id = excluded.neon_project_id,
        claude_cwd = excluded.claude_cwd,
        status = excluded.status,
        updated_at = excluded.updated_at
    `,
    args: [
      id,
      input.name,
      input.slug,
      input.repo_full_name ?? null,
      input.vercel_project_id ?? null,
      input.neon_project_id ?? null,
      input.claude_cwd ?? null,
      input.status ?? 'active',
      ts,
      ts
    ]
  })
  const project = await getProject(client, id)
  if (!project) throw new Error('upsertProject: row vanished after write')
  return project
}

export async function deleteProject(client: Client, id: string): Promise<void> {
  await client.execute({ sql: 'delete from projects where id = ?', args: [id] })
}

// ── Tasks ──────────────────────────────────────────────────────────────────
export async function getTasks(client: Client, projectId: string): Promise<Task[]> {
  const res = await client.execute({
    sql: 'select * from tasks where project_id = ? order by sort_order, created_at',
    args: [projectId]
  })
  return res.rows.map(mapTask)
}

export async function upsertTask(client: Client, input: TaskInput): Promise<Task> {
  const id = input.id ?? randomUUID()
  const ts = now()
  const stage = input.stage ?? 'backlog'
  // completed_at is set the moment a task first enters 'shipped', cleared if it leaves.
  await client.execute({
    sql: /* sql */ `
      insert into tasks
        (id, project_id, title, description, stage, estimate_hours, adjust_hours,
         sort_order, created_at, updated_at, completed_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        project_id = excluded.project_id,
        title = excluded.title,
        description = excluded.description,
        stage = excluded.stage,
        estimate_hours = excluded.estimate_hours,
        adjust_hours = excluded.adjust_hours,
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at,
        completed_at = case
          when excluded.stage = 'shipped' and tasks.completed_at is null then excluded.updated_at
          when excluded.stage <> 'shipped' then null
          else tasks.completed_at
        end
    `,
    args: [
      id,
      input.project_id,
      input.title,
      input.description ?? null,
      stage,
      input.estimate_hours ?? null,
      input.adjust_hours ?? 0,
      input.sort_order ?? 0,
      ts,
      ts,
      stage === 'shipped' ? ts : null
    ]
  })
  const res = await client.execute({ sql: 'select * from tasks where id = ?', args: [id] })
  return mapTask(res.rows[0])
}

export async function reorderTasks(
  client: Client,
  order: { id: string; sort_order: number; stage?: Task['stage'] }[]
): Promise<void> {
  const ts = now()
  // When a move changes stage, keep completed_at consistent with the shipped
  // invariant (matches upsertTask): stamp on first entry to 'shipped', clear on exit.
  const stmts = order.map((o) =>
    o.stage
      ? {
          sql: /* sql */ `update tasks set sort_order = ?, stage = ?, updated_at = ?,
                 completed_at = case
                   when ? = 'shipped' and completed_at is null then ?
                   when ? <> 'shipped' then null
                   else completed_at
                 end
               where id = ?`,
          args: [o.sort_order, o.stage, ts, o.stage, ts, o.stage, o.id]
        }
      : {
          sql: 'update tasks set sort_order = ?, updated_at = ? where id = ?',
          args: [o.sort_order, ts, o.id]
        }
  )
  await client.batch(stmts, 'write')
}

export async function deleteTask(client: Client, id: string): Promise<void> {
  await client.execute({ sql: 'delete from tasks where id = ?', args: [id] })
}

// ── Claude sessions ──────────────────────────────────────────────────────────
// Upsert on session id so re-parsing the same jsonl never double-counts.
export async function upsertSessions(client: Client, sessions: ClaudeSession[]): Promise<void> {
  if (sessions.length === 0) return
  const stmts = sessions.map((s) => ({
    sql: /* sql */ `
      insert into claude_sessions
        (id, project_id, claude_cwd, model, started_at, ended_at, active_seconds,
         input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
         est_cost_usd, ingested_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        claude_cwd = excluded.claude_cwd,
        model = excluded.model,
        started_at = excluded.started_at,
        ended_at = excluded.ended_at,
        active_seconds = excluded.active_seconds,
        input_tokens = excluded.input_tokens,
        output_tokens = excluded.output_tokens,
        cache_read_tokens = excluded.cache_read_tokens,
        cache_creation_tokens = excluded.cache_creation_tokens,
        est_cost_usd = excluded.est_cost_usd,
        ingested_at = excluded.ingested_at,
        -- Preserve a manual project assignment across re-parses: only take the
        -- freshly-matched project_id when we don't already have one stored.
        project_id = coalesce(claude_sessions.project_id, excluded.project_id)
    `,
    args: [
      s.id,
      s.project_id,
      s.claude_cwd,
      s.model,
      s.started_at,
      s.ended_at,
      s.active_seconds,
      s.input_tokens,
      s.output_tokens,
      s.cache_read_tokens,
      s.cache_creation_tokens,
      s.est_cost_usd,
      s.ingested_at
    ]
  }))
  await client.batch(stmts, 'write')
}

export async function getSessionsByProject(
  client: Client,
  projectId: string
): Promise<ClaudeSession[]> {
  const res = await client.execute({
    sql: 'select * from claude_sessions where project_id = ? order by started_at desc',
    args: [projectId]
  })
  return res.rows.map(mapSession)
}

export async function getUnassignedSessions(client: Client): Promise<ClaudeSession[]> {
  const res = await client.execute(
    'select * from claude_sessions where project_id is null order by started_at desc'
  )
  return res.rows.map(mapSession)
}

export async function assignSession(
  client: Client,
  sessionId: string,
  projectId: string
): Promise<void> {
  await client.execute({
    sql: 'update claude_sessions set project_id = ? where id = ?',
    args: [projectId, sessionId]
  })
}

// ── Deployments & repo activity (written by sync, read by UI) ─────────────────
export async function upsertDeployments(client: Client, rows: Deployment[]): Promise<void> {
  if (rows.length === 0) return
  const stmts = rows.map((d) => ({
    sql: /* sql */ `
      insert into deployments (id, project_id, target, state, url, created_at, meta)
      values (?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        target = excluded.target, state = excluded.state, url = excluded.url,
        created_at = excluded.created_at, meta = excluded.meta
    `,
    args: [d.id, d.project_id, d.target, d.state, d.url, d.created_at, d.meta]
  }))
  await client.batch(stmts, 'write')
}

export async function upsertRepoActivity(client: Client, rows: RepoActivity[]): Promise<void> {
  if (rows.length === 0) return
  const stmts = rows.map((a) => ({
    sql: /* sql */ `
      insert into repo_activity (id, project_id, kind, title, author, occurred_at, meta)
      values (?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        title = excluded.title, author = excluded.author,
        occurred_at = excluded.occurred_at, meta = excluded.meta
    `,
    args: [a.id, a.project_id, a.kind, a.title, a.author, a.occurred_at, a.meta]
  }))
  await client.batch(stmts, 'write')
}

export async function getDeployments(
  client: Client,
  projectId: string,
  limit = 10
): Promise<Deployment[]> {
  const res = await client.execute({
    sql: 'select * from deployments where project_id = ? order by created_at desc limit ?',
    args: [projectId, limit]
  })
  return res.rows.map(mapDeployment)
}

export async function getRepoActivity(
  client: Client,
  projectId: string,
  kind?: 'commit' | 'pr',
  limit = 15
): Promise<RepoActivity[]> {
  const res = await client.execute({
    sql: `select * from repo_activity where project_id = ?${kind ? ' and kind = ?' : ''}
          order by occurred_at desc limit ?`,
    args: kind ? [projectId, kind, limit] : [projectId, limit]
  })
  return res.rows.map(mapRepoActivity)
}

// ── Costs ────────────────────────────────────────────────────────────────────
export async function getCosts(
  client: Client,
  filter?: { month?: string; source?: string; project_id?: string }
): Promise<Cost[]> {
  const where: string[] = []
  const args: (string | number)[] = []
  if (filter?.source) {
    where.push('source = ?')
    args.push(filter.source)
  }
  if (filter?.project_id) {
    where.push('project_id = ?')
    args.push(filter.project_id)
  }
  if (filter?.month) {
    // month = 'YYYY-MM'; match rows whose period overlaps, falling back to created_at.
    where.push("(substr(coalesce(period_start, created_at), 1, 7) = ?)")
    args.push(filter.month)
  }
  const sql =
    'select * from costs' +
    (where.length ? ' where ' + where.join(' and ') : '') +
    ' order by coalesce(period_start, created_at) desc'
  const res = await client.execute({ sql, args })
  return res.rows.map(mapCost)
}

export async function upsertCost(client: Client, input: CostInput): Promise<Cost> {
  const id = input.id ?? randomUUID()
  await client.execute({
    sql: /* sql */ `
      insert into costs
        (id, project_id, source, description, amount_usd, period_start, period_end,
         recurring, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        project_id = excluded.project_id, source = excluded.source,
        description = excluded.description, amount_usd = excluded.amount_usd,
        period_start = excluded.period_start, period_end = excluded.period_end,
        recurring = excluded.recurring
    `,
    args: [
      id,
      input.project_id ?? null,
      input.source,
      input.description ?? null,
      input.amount_usd,
      input.period_start ?? null,
      input.period_end ?? null,
      input.recurring ? 1 : 0,
      now()
    ]
  })
  const res = await client.execute({ sql: 'select * from costs where id = ?', args: [id] })
  return mapCost(res.rows[0])
}

export async function deleteCost(client: Client, id: string): Promise<void> {
  await client.execute({ sql: 'delete from costs where id = ?', args: [id] })
}

// ── Derived hours & overview ─────────────────────────────────────────────────
// Project hours = sum(active_seconds)/3600 + sum(tasks.adjust_hours). Computed,
// never stored. `sinceIso` optionally scopes the Claude time to a window (e.g.
// month-to-date); adjust_hours is manual and always counted in full.
export async function getProjectHours(
  client: Client,
  projectId: string,
  sinceIso?: string
): Promise<number> {
  const secRes = await client.execute({
    sql: `select coalesce(sum(active_seconds), 0) as s
          from claude_sessions
          where project_id = ?${sinceIso ? ' and started_at >= ?' : ''}`,
    args: sinceIso ? [projectId, sinceIso] : [projectId]
  })
  const adjRes = await client.execute({
    sql: 'select coalesce(sum(adjust_hours), 0) as h from tasks where project_id = ?',
    args: [projectId]
  })
  return toNum(secRes.rows[0].s) / 3600 + toNum(adjRes.rows[0].h)
}

function startOfMonthIso(): string {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString()
}

export async function getProjectsOverview(client: Client): Promise<ProjectOverview[]> {
  const projects = await getProjects(client)
  const monthStart = startOfMonthIso()
  const monthKey = monthStart.slice(0, 7)

  const overviews: ProjectOverview[] = []
  for (const p of projects) {
    const hours = await getProjectHours(client, p.id, monthStart)

    const costRes = await client.execute({
      sql: `select coalesce(sum(amount_usd), 0) as c
            from costs
            where project_id = ? and substr(coalesce(period_start, created_at), 1, 7) = ?`,
      args: [p.id, monthKey]
    })

    // Estimated Claude spend for sessions started this month, so the headline
    // cost reflects total spend rather than only manually-entered infra costs.
    const claudeCostRes = await client.execute({
      sql: `select coalesce(sum(est_cost_usd), 0) as c
            from claude_sessions
            where project_id = ? and started_at >= ?`,
      args: [p.id, monthStart]
    })

    const prRes = await client.execute({
      sql: `select count(*) as n from repo_activity
            where project_id = ? and kind = 'pr'
              and coalesce(json_extract(meta, '$.state'), 'open') = 'open'`,
      args: [p.id]
    })

    const depRes = await client.execute({
      sql: `select state from deployments
            where project_id = ? order by created_at desc limit 1`,
      args: [p.id]
    })

    const infraCost = toNum(costRes.rows[0].c)
    const claudeCost = toNum(claudeCostRes.rows[0].c)
    overviews.push({
      ...p,
      hours_this_month: hours,
      cost_month_to_date: infraCost + claudeCost,
      infra_cost_month_to_date: infraCost,
      claude_cost_month_to_date: claudeCost,
      open_pr_count: toNum(prRes.rows[0].n),
      latest_deployment_state: depRes.rows[0] ? toStr(depRes.rows[0].state) : null
    })
  }
  return overviews
}

// ── Settings ─────────────────────────────────────────────────────────────────
export const SETTINGS_DEFAULTS: AppSettings = {
  github_token: '',
  vercel_token: '',
  vercel_team_id: '',
  idle_cap_seconds: 1800,
  sync_interval_minutes: 30
}

export async function getSettings(client: Client): Promise<AppSettings> {
  const res = await client.execute('select key, value from settings')
  const map = new Map(res.rows.map((r) => [String(r.key), r.value == null ? '' : String(r.value)]))
  return {
    github_token: map.get('github_token') ?? SETTINGS_DEFAULTS.github_token,
    vercel_token: map.get('vercel_token') ?? SETTINGS_DEFAULTS.vercel_token,
    vercel_team_id: map.get('vercel_team_id') ?? SETTINGS_DEFAULTS.vercel_team_id,
    idle_cap_seconds: map.has('idle_cap_seconds')
      ? Number(map.get('idle_cap_seconds'))
      : SETTINGS_DEFAULTS.idle_cap_seconds,
    sync_interval_minutes: map.has('sync_interval_minutes')
      ? Number(map.get('sync_interval_minutes'))
      : SETTINGS_DEFAULTS.sync_interval_minutes
  }
}

export async function getSetting(client: Client, key: string): Promise<string | null> {
  const res = await client.execute({ sql: 'select value from settings where key = ?', args: [key] })
  return res.rows[0] ? toStr(res.rows[0].value) : null
}

export async function setSettings(
  client: Client,
  patch: Partial<Record<keyof AppSettings, string | number>>
): Promise<AppSettings> {
  const stmts = Object.entries(patch).map(([key, value]) => ({
    sql: `insert into settings (key, value) values (?, ?)
          on conflict(key) do update set value = excluded.value`,
    args: [key, String(value)]
  }))
  if (stmts.length) await client.batch(stmts, 'write')
  return getSettings(client)
}
