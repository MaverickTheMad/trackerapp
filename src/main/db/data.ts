import { randomUUID } from 'crypto'
import type { Client, Row } from '@libsql/client'
import type {
  Project,
  ProjectInput,
  ProjectOverview,
  Task,
  TaskInput,
  TaskStage,
  TaskWithProject,
  ClaudeSession,
  Chat,
  Deployment,
  RepoActivity,
  Cost,
  CostInput,
  AppSettings,
  Account,
  AccountInput,
  MetricsWeek,
  WeeklyDigest,
  DigestShipped,
  DigestProjectHours,
  DigestStuckTask
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
    github_account_id: toStr(r.github_account_id),
    vercel_account_id: toStr(r.vercel_account_id),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at)
  }
}

function mapAccount(r: Row): Account {
  return {
    id: String(r.id),
    provider: String(r.provider) as Account['provider'],
    label: String(r.label),
    token: String(r.token),
    team_id: toStr(r.team_id),
    created_at: String(r.created_at)
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

function mapChat(r: Row): Chat {
  return {
    id: String(r.id),
    project_id: toStr(r.project_id),
    name: toStr(r.name),
    summary: toStr(r.summary),
    kind: String(r.kind) as Chat['kind'],
    message_count: toNum(r.message_count),
    started_at: String(r.started_at),
    ended_at: String(r.ended_at),
    active_seconds: toNum(r.active_seconds),
    source_export: toStr(r.source_export),
    created_at: String(r.created_at),
    updated_at: toStr(r.updated_at),
    imported_at: String(r.imported_at)
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
         claude_cwd, status, github_account_id, vercel_account_id, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        name = excluded.name,
        slug = excluded.slug,
        repo_full_name = excluded.repo_full_name,
        vercel_project_id = excluded.vercel_project_id,
        neon_project_id = excluded.neon_project_id,
        claude_cwd = excluded.claude_cwd,
        status = excluded.status,
        github_account_id = excluded.github_account_id,
        vercel_account_id = excluded.vercel_account_id,
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
      input.github_account_id ?? null,
      input.vercel_account_id ?? null,
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

// ── Accounts ─────────────────────────────────────────────────────────────────
export async function getAccounts(client: Client): Promise<Account[]> {
  const res = await client.execute('select * from accounts order by provider, label collate nocase')
  return res.rows.map(mapAccount)
}

export async function getAccount(client: Client, id: string): Promise<Account | null> {
  const res = await client.execute({ sql: 'select * from accounts where id = ?', args: [id] })
  return res.rows[0] ? mapAccount(res.rows[0]) : null
}

export async function upsertAccount(client: Client, input: AccountInput): Promise<Account> {
  const id = input.id ?? randomUUID()
  await client.execute({
    sql: /* sql */ `
      insert into accounts (id, provider, label, token, team_id, created_at)
      values (?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        provider = excluded.provider,
        label = excluded.label,
        token = excluded.token,
        team_id = excluded.team_id
    `,
    args: [id, input.provider, input.label, input.token, input.team_id ?? null, now()]
  })
  const account = await getAccount(client, id)
  if (!account) throw new Error('upsertAccount: row vanished after write')
  return account
}

export async function deleteAccount(client: Client, id: string): Promise<void> {
  await client.execute({ sql: 'delete from accounts where id = ?', args: [id] })
}

// ── Tasks ──────────────────────────────────────────────────────────────────
export async function getTasks(client: Client, projectId: string): Promise<Task[]> {
  const res = await client.execute({
    sql: 'select * from tasks where project_id = ? order by sort_order, created_at',
    args: [projectId]
  })
  return res.rows.map(mapTask)
}

// Every task across all projects, each row carrying its project's name (left
// join so tasks with a null project_id are still returned). Filters are applied
// in SQL; a stable default order (project name, then sort_order) — the renderer
// re-sorts. The row shape is tasks.* plus project_name, so mapTask still works.
export async function getAllTasks(
  client: Client,
  filter?: { project_id?: string; stage?: TaskStage; blocked_only?: boolean }
): Promise<TaskWithProject[]> {
  const where: string[] = []
  const args: (string | number)[] = []
  if (filter?.project_id) {
    where.push('t.project_id = ?')
    args.push(filter.project_id)
  }
  if (filter?.stage) {
    where.push('t.stage = ?')
    args.push(filter.stage)
  }
  if (filter?.blocked_only) {
    where.push("t.stage = 'blocked'")
  }
  const sql =
    `select t.*, p.name as project_name
     from tasks t left join projects p on p.id = t.project_id` +
    (where.length ? ' where ' + where.join(' and ') : '') +
    ' order by p.name collate nocase, t.sort_order, t.created_at'
  const res = await client.execute({ sql, args })
  return res.rows.map((r) => ({ ...mapTask(r), project_name: toStr(r.project_name) }))
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

// ── Chats (imported from Claude data exports) ─────────────────────────────────
// Upsert on chat id so re-importing the same export never duplicates. A manual
// project tag is preserved across re-imports via the same coalesce idiom as
// upsertSessions: only take the freshly-parsed project_id when none is stored.
export async function upsertChats(client: Client, chats: Chat[]): Promise<void> {
  if (chats.length === 0) return
  const stmts = chats.map((c) => ({
    sql: /* sql */ `
      insert into chats
        (id, project_id, name, summary, kind, message_count, started_at, ended_at,
         active_seconds, source_export, created_at, updated_at, imported_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        name = excluded.name,
        summary = excluded.summary,
        kind = excluded.kind,
        message_count = excluded.message_count,
        started_at = excluded.started_at,
        ended_at = excluded.ended_at,
        active_seconds = excluded.active_seconds,
        source_export = excluded.source_export,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        imported_at = excluded.imported_at,
        -- Preserve a manual project assignment across re-imports.
        project_id = coalesce(chats.project_id, excluded.project_id)
    `,
    args: [
      c.id,
      c.project_id,
      c.name,
      c.summary,
      c.kind,
      c.message_count,
      c.started_at,
      c.ended_at,
      c.active_seconds,
      c.source_export,
      c.created_at,
      c.updated_at,
      c.imported_at
    ]
  }))
  await client.batch(stmts, 'write')
}

export async function getChats(client: Client): Promise<Chat[]> {
  const res = await client.execute('select * from chats order by started_at desc')
  return res.rows.map(mapChat)
}

export async function getChatsByProject(client: Client, projectId: string): Promise<Chat[]> {
  const res = await client.execute({
    sql: 'select * from chats where project_id = ? order by started_at desc',
    args: [projectId]
  })
  return res.rows.map(mapChat)
}

export async function getUnassignedChats(client: Client): Promise<Chat[]> {
  const res = await client.execute(
    'select * from chats where project_id is null order by started_at desc'
  )
  return res.rows.map(mapChat)
}

export async function assignChat(
  client: Client,
  chatId: string,
  projectId: string
): Promise<void> {
  await client.execute({
    sql: 'update chats set project_id = ? where id = ?',
    args: [projectId, chatId]
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

// Monday 00:00 UTC of the current week. getUTCDay() is 0 (Sun)..6 (Sat); shift so
// Monday is the first day (Sunday counts as 6 days into the prior Monday's week).
function startOfWeekIso(): string {
  const d = new Date()
  const dow = d.getUTCDay()
  const daysSinceMonday = (dow + 6) % 7
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday)
  return monday.toISOString()
}

export async function getProjectsOverview(client: Client): Promise<ProjectOverview[]> {
  const projects = await getProjects(client)
  const monthStart = startOfMonthIso()
  const monthKey = monthStart.slice(0, 7)
  const weekStart = startOfWeekIso()

  const overviews: ProjectOverview[] = []
  for (const p of projects) {
    const hours = await getProjectHours(client, p.id, monthStart)
    const hoursWeek = await getProjectHours(client, p.id, weekStart)

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

    // Open-task counts by stage in one pass; open = anything not shipped.
    const taskRes = await client.execute({
      sql: `select
              coalesce(sum(case when stage = 'backlog' then 1 else 0 end), 0) as backlog,
              coalesce(sum(case when stage = 'in_progress' then 1 else 0 end), 0) as in_progress,
              coalesce(sum(case when stage = 'blocked' then 1 else 0 end), 0) as blocked,
              coalesce(sum(case when stage <> 'shipped' then 1 else 0 end), 0) as open
            from tasks where project_id = ?`,
      args: [p.id]
    })

    const oldestIpRes = await client.execute({
      sql: `select min(created_at) as t from tasks
            where project_id = ? and stage = 'in_progress'`,
      args: [p.id]
    })

    // Last activity = latest of newest commit / deploy / session (no chat yet).
    const activityRes = await client.execute({
      sql: `select max(t) as t from (
              select max(occurred_at) as t from repo_activity
                where project_id = ? and kind = 'commit'
              union all
              select max(created_at) as t from deployments where project_id = ?
              union all
              select max(started_at) as t from claude_sessions where project_id = ?
            )`,
      args: [p.id, p.id, p.id]
    })

    // Latest production-target deploy failed (ERROR/CANCELED, case-insensitive).
    const prodDepRes = await client.execute({
      sql: `select state from deployments
            where project_id = ? and lower(coalesce(target, '')) = 'production'
            order by created_at desc limit 1`,
      args: [p.id]
    })
    const prodState = prodDepRes.rows[0] ? (toStr(prodDepRes.rows[0].state) ?? '').toUpperCase() : ''

    const infraCost = toNum(costRes.rows[0].c)
    const claudeCost = toNum(claudeCostRes.rows[0].c)
    overviews.push({
      ...p,
      hours_this_month: hours,
      hours_this_week: hoursWeek,
      cost_month_to_date: infraCost + claudeCost,
      infra_cost_month_to_date: infraCost,
      claude_cost_month_to_date: claudeCost,
      open_pr_count: toNum(prRes.rows[0].n),
      latest_deployment_state: depRes.rows[0] ? toStr(depRes.rows[0].state) : null,
      backlog_count: toNum(taskRes.rows[0].backlog),
      in_progress_count: toNum(taskRes.rows[0].in_progress),
      blocked_count: toNum(taskRes.rows[0].blocked),
      open_task_count: toNum(taskRes.rows[0].open),
      oldest_in_progress_at: toStr(oldestIpRes.rows[0].t),
      last_activity_at: toStr(activityRes.rows[0].t),
      production_deploy_failed: prodState === 'ERROR' || prodState === 'CANCELED',
      needs_github_account: p.repo_full_name != null && p.github_account_id == null,
      needs_vercel_account: p.vercel_project_id != null && p.vercel_account_id == null
    })
  }
  return overviews
}

// ── Metrics / insights (Phase 5) ──────────────────────────────────────────────
// metrics_daily holds ONE row per (UTC day, project). Untagged sessions/chats
// (null project_id) are not aggregated until they're assigned. Global figures =
// sum across project_id for a day (no separate global row). All day keys use
// substr(<ts>,1,10) over ISO-Z timestamps — portable and UTC-correct.

// Monday-UTC week start (YYYY-MM-DD) for an arbitrary YYYY-MM-DD day key. Mirrors
// the Monday-UTC logic in startOfWeekIso so the renderer never duplicates it.
function weekStartOf(dayYmd: string): string {
  const d = new Date(dayYmd + 'T00:00:00Z')
  const daysSinceMonday = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - daysSinceMonday)
  return d.toISOString().slice(0, 10)
}

// Add n days to a YYYY-MM-DD day key, returning YYYY-MM-DD.
function addDaysYmd(dayYmd: string, n: number): string {
  const d = new Date(dayYmd + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

interface MetricAccum {
  date: string
  project_id: string
  code_hours: number
  chat_hours: number
  claude_cost_usd: number
  tasks_completed: number
  deploys: number
}

// One-time historical backfill (migration run step). Buckets existing rows by UTC
// day and project, for everything reconstructable from timestamps. tasks_open is
// a point-in-time snapshot that CANNOT be reconstructed for past days, so it is
// left at its default 0 for backfilled rows (only upsertMetricsForToday sets it,
// for today). Idempotent: re-running preserves any existing tasks_open (the
// on-conflict clause deliberately does not touch it).
export async function backfillMetrics(client: Client): Promise<void> {
  const rows = new Map<string, MetricAccum>()
  const get = (date: string, pid: string): MetricAccum => {
    const key = `${date}|${pid}`
    let m = rows.get(key)
    if (!m) {
      m = {
        date,
        project_id: pid,
        code_hours: 0,
        chat_hours: 0,
        claude_cost_usd: 0,
        tasks_completed: 0,
        deploys: 0
      }
      rows.set(key, m)
    }
    return m
  }

  const sess = await client.execute(`
    select substr(started_at, 1, 10) as d, project_id as pid,
           coalesce(sum(active_seconds), 0) as secs,
           coalesce(sum(est_cost_usd), 0) as cost
    from claude_sessions
    where project_id is not null
    group by d, pid`)
  for (const r of sess.rows) {
    const m = get(String(r.d), String(r.pid))
    m.code_hours = toNum(r.secs) / 3600
    m.claude_cost_usd = toNum(r.cost)
  }

  const chatRows = await client.execute(`
    select substr(started_at, 1, 10) as d, project_id as pid,
           coalesce(sum(active_seconds), 0) as secs
    from chats
    where project_id is not null
    group by d, pid`)
  for (const r of chatRows.rows) {
    get(String(r.d), String(r.pid)).chat_hours = toNum(r.secs) / 3600
  }

  const done = await client.execute(`
    select substr(completed_at, 1, 10) as d, project_id as pid, count(*) as n
    from tasks
    where completed_at is not null and project_id is not null
    group by d, pid`)
  for (const r of done.rows) {
    get(String(r.d), String(r.pid)).tasks_completed = toNum(r.n)
  }

  const dep = await client.execute(`
    select substr(created_at, 1, 10) as d, project_id as pid, count(*) as n
    from deployments
    where project_id is not null
    group by d, pid`)
  for (const r of dep.rows) {
    get(String(r.d), String(r.pid)).deploys = toNum(r.n)
  }

  if (rows.size === 0) return
  const stmts = [...rows.values()].map((m) => ({
    // Note: tasks_open is intentionally omitted from the update clause so an
    // existing today-row's snapshot survives a re-run of the backfill.
    sql: /* sql */ `
      insert into metrics_daily
        (date, project_id, code_hours, chat_hours, claude_cost_usd,
         tasks_completed, tasks_open, deploys)
      values (?, ?, ?, ?, ?, ?, 0, ?)
      on conflict(date, project_id) do update set
        code_hours = excluded.code_hours,
        chat_hours = excluded.chat_hours,
        claude_cost_usd = excluded.claude_cost_usd,
        tasks_completed = excluded.tasks_completed,
        deploys = excluded.deploys
    `,
    args: [m.date, m.project_id, m.code_hours, m.chat_hours, m.claude_cost_usd, m.tasks_completed, m.deploys]
  }))
  await client.batch(stmts, 'write')
}

// Recompute TODAY's per-project rows in full, including the tasks_open snapshot
// (current count of non-shipped tasks). Called at the end of every sync so today
// stays live while past days freeze. code_hours here is session hours only — the
// overview's manual adjust_hours fudge is intentionally excluded (it isn't tied
// to a day), so a project's overview hours can differ slightly from the sum of
// its daily code_hours. That difference is expected.
export async function upsertMetricsForToday(client: Client): Promise<void> {
  const day = new Date().toISOString().slice(0, 10)
  const projects = await getProjects(client)
  const stmts: { sql: string; args: (string | number)[] }[] = []

  for (const p of projects) {
    const s = await client.execute({
      sql: `select coalesce(sum(active_seconds), 0) as secs, coalesce(sum(est_cost_usd), 0) as cost
            from claude_sessions where project_id = ? and substr(started_at, 1, 10) = ?`,
      args: [p.id, day]
    })
    const c = await client.execute({
      sql: `select coalesce(sum(active_seconds), 0) as secs
            from chats where project_id = ? and substr(started_at, 1, 10) = ?`,
      args: [p.id, day]
    })
    const tc = await client.execute({
      sql: `select count(*) as n from tasks
            where project_id = ? and substr(completed_at, 1, 10) = ?`,
      args: [p.id, day]
    })
    const dp = await client.execute({
      sql: `select count(*) as n from deployments
            where project_id = ? and substr(created_at, 1, 10) = ?`,
      args: [p.id, day]
    })
    const open = await client.execute({
      sql: `select count(*) as n from tasks where project_id = ? and stage <> 'shipped'`,
      args: [p.id]
    })

    const codeHours = toNum(s.rows[0].secs) / 3600
    const chatHours = toNum(c.rows[0].secs) / 3600
    const cost = toNum(s.rows[0].cost)
    const completed = toNum(tc.rows[0].n)
    const deploys = toNum(dp.rows[0].n)
    const tasksOpen = toNum(open.rows[0].n)

    // Only persist rows with signal (avoids a zero row per idle project per day).
    if (codeHours || chatHours || cost || completed || deploys || tasksOpen) {
      stmts.push({
        sql: /* sql */ `
          insert into metrics_daily
            (date, project_id, code_hours, chat_hours, claude_cost_usd,
             tasks_completed, tasks_open, deploys)
          values (?, ?, ?, ?, ?, ?, ?, ?)
          on conflict(date, project_id) do update set
            code_hours = excluded.code_hours,
            chat_hours = excluded.chat_hours,
            claude_cost_usd = excluded.claude_cost_usd,
            tasks_completed = excluded.tasks_completed,
            tasks_open = excluded.tasks_open,
            deploys = excluded.deploys
        `,
        args: [day, p.id, codeHours, chatHours, cost, completed, tasksOpen, deploys]
      })
    }
  }
  if (stmts.length) await client.batch(stmts, 'write')
}

// Weekly buckets (Monday-UTC) over metrics_daily, summed across projects unless a
// project_id filter is given. Week bucketing is done here so the renderer stays
// date-math free.
export async function getMetricsWeekly(
  client: Client,
  filter: { from?: string; to?: string; project_id?: string } = {}
): Promise<MetricsWeek[]> {
  const where: string[] = ['1 = 1']
  const args: string[] = []
  if (filter.project_id) {
    where.push('project_id = ?')
    args.push(filter.project_id)
  }
  if (filter.from) {
    where.push('date >= ?')
    args.push(filter.from)
  }
  if (filter.to) {
    where.push('date <= ?')
    args.push(filter.to)
  }
  const res = await client.execute({
    sql: `select date, code_hours, chat_hours, claude_cost_usd, tasks_completed, deploys
          from metrics_daily where ${where.join(' and ')} order by date`,
    args
  })

  const weeks = new Map<string, MetricsWeek>()
  for (const r of res.rows) {
    const wk = weekStartOf(String(r.date))
    let m = weeks.get(wk)
    if (!m) {
      m = {
        week_start: wk,
        code_hours: 0,
        chat_hours: 0,
        claude_cost_usd: 0,
        tasks_completed: 0,
        deploys: 0
      }
      weeks.set(wk, m)
    }
    m.code_hours += toNum(r.code_hours)
    m.chat_hours += toNum(r.chat_hours)
    m.claude_cost_usd += toNum(r.claude_cost_usd)
    m.tasks_completed += toNum(r.tasks_completed)
    m.deploys += toNum(r.deploys)
  }
  return [...weeks.values()].sort((a, b) => a.week_start.localeCompare(b.week_start))
}

// Deterministic (no LLM) digest for a single Mon–Sun week. weekStart is a Monday
// YYYY-MM-DD; the week is [weekStart, weekStart+7) by day key. Reads live source
// tables (not metrics_daily) so it works even before a sync recomputes today.
export async function getWeeklyDigest(
  client: Client,
  weekStart: string,
  projectId?: string
): Promise<WeeklyDigest> {
  const from = weekStart // inclusive
  const toExclusive = addDaysYmd(weekStart, 7) // exclusive
  const weekEnd = addDaysYmd(weekStart, 6) // Sunday, inclusive (for display)
  const pFilter = projectId ? ' and project_id = ?' : ''
  const projects = await getProjects(client)
  const nameOf = new Map(projects.map((p) => [p.id, p.name]))

  // Shipped: successful (READY) production-target deploys created that week.
  const shipRes = await client.execute({
    sql: `select id, project_id, url, state, created_at from deployments
          where lower(coalesce(target, '')) = 'production'
            and upper(coalesce(state, '')) = 'READY'
            and substr(created_at, 1, 10) >= ? and substr(created_at, 1, 10) < ?
            ${projectId ? 'and project_id = ?' : ''}
          order by created_at`,
    args: projectId ? [from, toExclusive, projectId] : [from, toExclusive]
  })
  const shipped: DigestShipped[] = shipRes.rows.map((r) => ({
    deployment_id: String(r.id),
    project_id: String(r.project_id),
    project_name: nameOf.get(String(r.project_id)) ?? null,
    url: toStr(r.url),
    state: toStr(r.state),
    created_at: String(r.created_at)
  }))

  // Hours per project (code + chat) within the week.
  const hoursMap = new Map<string, DigestProjectHours>()
  const ensureHours = (pid: string): DigestProjectHours => {
    let h = hoursMap.get(pid)
    if (!h) {
      h = { project_id: pid, project_name: nameOf.get(pid) ?? null, code_hours: 0, chat_hours: 0 }
      hoursMap.set(pid, h)
    }
    return h
  }
  const codeRes = await client.execute({
    sql: `select project_id as pid, coalesce(sum(active_seconds), 0) as secs
          from claude_sessions
          where project_id is not null
            and substr(started_at, 1, 10) >= ? and substr(started_at, 1, 10) < ?${pFilter}
          group by pid`,
    args: projectId ? [from, toExclusive, projectId] : [from, toExclusive]
  })
  for (const r of codeRes.rows) ensureHours(String(r.pid)).code_hours = toNum(r.secs) / 3600
  const chatRes = await client.execute({
    sql: `select project_id as pid, coalesce(sum(active_seconds), 0) as secs
          from chats
          where project_id is not null
            and substr(started_at, 1, 10) >= ? and substr(started_at, 1, 10) < ?${pFilter}
          group by pid`,
    args: projectId ? [from, toExclusive, projectId] : [from, toExclusive]
  })
  for (const r of chatRes.rows) ensureHours(String(r.pid)).chat_hours = toNum(r.secs) / 3600

  // Total Claude cost (sessions) for the week.
  const costRes = await client.execute({
    sql: `select coalesce(sum(est_cost_usd), 0) as c from claude_sessions
          where project_id is not null
            and substr(started_at, 1, 10) >= ? and substr(started_at, 1, 10) < ?${pFilter}`,
    args: projectId ? [from, toExclusive, projectId] : [from, toExclusive]
  })

  // Tasks completed vs opened in the week.
  const completedRes = await client.execute({
    sql: `select count(*) as n from tasks
          where completed_at is not null
            and substr(completed_at, 1, 10) >= ? and substr(completed_at, 1, 10) < ?${pFilter}`,
    args: projectId ? [from, toExclusive, projectId] : [from, toExclusive]
  })
  const openedRes = await client.execute({
    sql: `select count(*) as n from tasks
          where substr(created_at, 1, 10) >= ? and substr(created_at, 1, 10) < ?${pFilter}`,
    args: projectId ? [from, toExclusive, projectId] : [from, toExclusive]
  })

  // Currently stuck/blocked tasks (not week-scoped — a live snapshot). Uses the
  // updated_at proxy for "since", consistent with the Task dashboard.
  const settings = await getSettings(client)
  const stuckRes = await client.execute({
    sql: `select t.id, t.project_id, t.title, t.stage, t.updated_at
          from tasks t
          where t.stage in ('blocked', 'in_progress')${projectId ? ' and t.project_id = ?' : ''}`,
    args: projectId ? [projectId] : []
  })
  const nowMs = Date.now()
  const stuck_tasks: DigestStuckTask[] = []
  for (const r of stuckRes.rows) {
    const stage = String(r.stage) as DigestStuckTask['stage']
    const days = (nowMs - new Date(String(r.updated_at)).getTime()) / 86400000
    const threshold = stage === 'blocked' ? settings.blocked_days : settings.stuck_days
    if (days > threshold) {
      const pid = toStr(r.project_id)
      stuck_tasks.push({
        id: String(r.id),
        project_id: pid,
        project_name: pid ? nameOf.get(pid) ?? null : null,
        title: String(r.title),
        stage,
        days: Math.round(days)
      })
    }
  }

  return {
    week_start: from,
    week_end: weekEnd,
    project_id: projectId ?? null,
    shipped,
    hours_by_project: [...hoursMap.values()].sort(
      (a, b) => b.code_hours + b.chat_hours - (a.code_hours + a.chat_hours)
    ),
    total_claude_cost_usd: toNum(costRes.rows[0].c),
    tasks_completed: toNum(completedRes.rows[0].n),
    tasks_opened: toNum(openedRes.rows[0].n),
    stuck_tasks
  }
}

// ── Settings ─────────────────────────────────────────────────────────────────
export const SETTINGS_DEFAULTS: AppSettings = {
  idle_cap_seconds: 1800,
  sync_interval_minutes: 30,
  blocked_days: 3,
  stuck_days: 7,
  stale_days: 14,
  chat_hours_in_combined: '0',
  chats_last_import: ''
}

export async function getSettings(client: Client): Promise<AppSettings> {
  const res = await client.execute('select key, value from settings')
  const map = new Map(res.rows.map((r) => [String(r.key), r.value == null ? '' : String(r.value)]))
  return {
    idle_cap_seconds: map.has('idle_cap_seconds')
      ? Number(map.get('idle_cap_seconds'))
      : SETTINGS_DEFAULTS.idle_cap_seconds,
    sync_interval_minutes: map.has('sync_interval_minutes')
      ? Number(map.get('sync_interval_minutes'))
      : SETTINGS_DEFAULTS.sync_interval_minutes,
    blocked_days: map.has('blocked_days')
      ? Number(map.get('blocked_days'))
      : SETTINGS_DEFAULTS.blocked_days,
    stuck_days: map.has('stuck_days') ? Number(map.get('stuck_days')) : SETTINGS_DEFAULTS.stuck_days,
    stale_days: map.has('stale_days') ? Number(map.get('stale_days')) : SETTINGS_DEFAULTS.stale_days,
    chat_hours_in_combined:
      map.get('chat_hours_in_combined') ?? SETTINGS_DEFAULTS.chat_hours_in_combined,
    chats_last_import: map.get('chats_last_import') ?? SETTINGS_DEFAULTS.chats_last_import
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
