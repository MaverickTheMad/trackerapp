// Shared domain types. Mirror the libSQL schema (see src/main/db/migrate.ts).
// Kept Postgres-portable: text ids, ISO-8601 UTC timestamp strings, 0/1 booleans
// surfaced as JS booleans at the data-module boundary, REAL money/hours, INTEGER tokens.

export type ProjectStatus = 'active' | 'paused' | 'archived'
export type TaskStage = 'backlog' | 'in_progress' | 'blocked' | 'shipped'
export type CostSource = 'vercel' | 'neon' | 'domain' | 'manual'
export type AccountProvider = 'github' | 'vercel'

export interface Project {
  id: string
  name: string
  slug: string
  repo_full_name: string | null
  vercel_project_id: string | null
  neon_project_id: string | null
  claude_cwd: string | null
  status: ProjectStatus
  github_account_id: string | null
  vercel_account_id: string | null
  created_at: string
  updated_at: string
}

// Fields accepted when creating/updating a project. id optional (generated if absent).
export interface ProjectInput {
  id?: string
  name: string
  slug: string
  repo_full_name?: string | null
  vercel_project_id?: string | null
  neon_project_id?: string | null
  claude_cwd?: string | null
  status?: ProjectStatus
  github_account_id?: string | null
  vercel_account_id?: string | null
}

// A linked GitHub/Vercel credential. Multiple accounts per provider let a
// project pick which one to sync with (personal vs. team, etc).
export interface Account {
  id: string
  provider: AccountProvider
  label: string
  token: string
  team_id: string | null
  created_at: string
}

export interface AccountInput {
  id?: string
  provider: AccountProvider
  label: string
  token: string
  team_id?: string | null
}

export interface Task {
  id: string
  project_id: string | null
  title: string
  description: string | null
  stage: TaskStage
  estimate_hours: number | null
  adjust_hours: number
  sort_order: number
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface TaskInput {
  id?: string
  project_id: string | null
  title: string
  description?: string | null
  stage?: TaskStage
  estimate_hours?: number | null
  adjust_hours?: number
  sort_order?: number
}

// A task joined to its project's name for the cross-project dashboard.
// project_name is null-safe: tasks may have a null project_id per the schema.
export interface TaskWithProject extends Task {
  project_name: string | null
}

export interface ClaudeSession {
  id: string
  project_id: string | null
  claude_cwd: string | null
  model: string | null
  started_at: string
  ended_at: string
  active_seconds: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_creation_tokens: number
  est_cost_usd: number
  ingested_at: string
}

// A chat imported from a Claude data export. Hours live in their own bucket
// (never merged into Claude-session/code hours). No cost — exports carry none.
export type ChatKind = 'regular' | 'design'

export interface Chat {
  id: string
  project_id: string | null
  name: string | null
  summary: string | null
  kind: ChatKind
  message_count: number
  started_at: string
  ended_at: string
  active_seconds: number
  source_export: string | null
  created_at: string // conversation-level created_at
  updated_at: string | null // conversation-level updated_at
  imported_at: string
}

// Result of a chats:import run (main opens the file picker; may be canceled).
export interface ChatImportResult {
  imported: number
  canceled: boolean
  last_import: string | null
}

export interface Deployment {
  id: string
  project_id: string
  target: string | null
  state: string | null
  url: string | null
  created_at: string
  meta: string | null
}

export interface RepoActivity {
  id: string
  project_id: string
  kind: 'commit' | 'pr'
  title: string | null
  author: string | null
  occurred_at: string
  meta: string | null
}

export interface Cost {
  id: string
  project_id: string | null
  source: CostSource
  description: string | null
  amount_usd: number
  period_start: string | null
  period_end: string | null
  recurring: boolean
  created_at: string
}

export interface CostInput {
  id?: string
  project_id?: string | null
  source: CostSource
  description?: string | null
  amount_usd: number
  period_start?: string | null
  period_end?: string | null
  recurring?: boolean
}

// Overview card: project plus derived aggregates.
export interface ProjectOverview extends Project {
  hours_this_month: number
  hours_this_week: number // code hours only (Claude sessions); chat hours land in Phase 4
  // Total month-to-date spend = infra/manual costs + estimated Claude cost.
  cost_month_to_date: number
  infra_cost_month_to_date: number // from the costs table (vercel/neon/domain/manual)
  claude_cost_month_to_date: number // estimated from Claude sessions started this month
  open_pr_count: number
  latest_deployment_state: string | null // latest deploy of any target
  // Task counts by stage. open_task_count = everything not shipped.
  backlog_count: number
  in_progress_count: number
  blocked_count: number
  open_task_count: number
  oldest_in_progress_at: string | null // min(created_at) of in_progress tasks
  // Latest activity across commits/deploys/sessions (no chat until Phase 4).
  last_activity_at: string | null
  // Latest production-target deploy is in an ERROR/CANCELED state.
  production_deploy_failed: boolean
  // Phase 1 "needs account" state: a source is configured but unlinked.
  needs_github_account: boolean
  needs_vercel_account: boolean
}

// ── Insights (Phase 5) ────────────────────────────────────────────────────────
// A weekly bucket of daily metrics (Monday-UTC week start). Summed across
// projects when no project filter is applied. Claude cost only — infra costs
// stay monthly on the Costs surface. tasks_open (a point-in-time snapshot) is
// deliberately not summed into weekly buckets.
export interface MetricsWeek {
  week_start: string // YYYY-MM-DD, Monday UTC
  code_hours: number
  chat_hours: number
  claude_cost_usd: number
  tasks_completed: number
  deploys: number
}

export interface DigestShipped {
  deployment_id: string
  project_id: string
  project_name: string | null
  url: string | null
  state: string | null
  created_at: string
}

export interface DigestProjectHours {
  project_id: string
  project_name: string | null
  code_hours: number
  chat_hours: number
}

export interface DigestStuckTask {
  id: string
  project_id: string | null
  project_name: string | null
  title: string
  stage: TaskStage
  days: number // days since last change (updated_at proxy)
}

// Deterministic (no LLM) weekly digest for a Mon–Sun week.
export interface WeeklyDigest {
  week_start: string // Monday, YYYY-MM-DD
  week_end: string // Sunday (inclusive), YYYY-MM-DD
  project_id: string | null
  shipped: DigestShipped[] // successful production deploys that week
  hours_by_project: DigestProjectHours[]
  total_claude_cost_usd: number
  tasks_completed: number
  tasks_opened: number
  stuck_tasks: DigestStuckTask[] // current blocked/in-progress beyond thresholds
}

export type SyncPhase = 'idle' | 'running' | 'error'

export interface SyncStatus {
  phase: SyncPhase
  last_run_at: string | null
  last_error: string | null
  // Per-source outcome from the most recent run.
  sources: Record<string, { ok: boolean; message: string }>
}

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateStatus {
  state: UpdateState
  version?: string
  percent?: number
  message?: string
}

export interface AppSettings {
  idle_cap_seconds: number
  sync_interval_minutes: number
  blocked_days: number
  stuck_days: number
  stale_days: number
  chat_hours_in_combined: string
  chats_last_import: string // ISO timestamp of the last chat-export import, '' if never
}
