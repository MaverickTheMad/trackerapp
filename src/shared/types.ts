// Shared domain types. Mirror the libSQL schema (see src/main/db/migrate.ts).
// Kept Postgres-portable: text ids, ISO-8601 UTC timestamp strings, 0/1 booleans
// surfaced as JS booleans at the data-module boundary, REAL money/hours, INTEGER tokens.

export type ProjectStatus = 'active' | 'paused' | 'archived'
export type TaskStage = 'backlog' | 'in_progress' | 'blocked' | 'shipped'
export type CostSource = 'vercel' | 'neon' | 'domain' | 'manual'

export interface Project {
  id: string
  name: string
  slug: string
  repo_full_name: string | null
  vercel_project_id: string | null
  neon_project_id: string | null
  claude_cwd: string | null
  status: ProjectStatus
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
  // Total month-to-date spend = infra/manual costs + estimated Claude cost.
  cost_month_to_date: number
  infra_cost_month_to_date: number // from the costs table (vercel/neon/domain/manual)
  claude_cost_month_to_date: number // estimated from Claude sessions started this month
  open_pr_count: number
  latest_deployment_state: string | null
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
  github_token: string
  vercel_token: string
  vercel_team_id: string
  idle_cap_seconds: number
  sync_interval_minutes: number
}
