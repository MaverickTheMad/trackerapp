# Project Tracker v2 — Migration & File-Change Plan

Planned in Opus; built in Sonnet under Opus oversight. **This is an addendum to v1.
Keep every v1 constraint: no server, no auth, all DB access through the one data
module (`src/main/db/data.ts`), schema stays Postgres-portable, `os.homedir()` for
paths, renderer only speaks IPC.**

## Locked decisions
1. **Zip library = `fflate`** (pure-JS, no native build; safest for electron-builder).
2. **Per-phase migrations**: `0002` accounts, `0003` chats, `0004` metrics.
3. **Legacy token rows stay** in the `settings` table after the move (read once by the migration).

## Portability mapping (keep DDL portable)
text id → uuid, ISO text → timestamptz, integer 0/1 → boolean, real → numeric, text json → jsonb.

---

## Cross-cutting foundation (do once, in Phase 1)

**A. One-time data migrations.** In `src/main/db/migrate.ts` extend the interface to
`{ id: string; sql?: string; run?: (client: Client) => Promise<void> }`. In the loop:
run `sql` via `executeMultiple` (if present), then `await m.run?.(client)`, then record
the id in `schema_migrations`. This preserves "runs exactly once, recorded" — the correct
guarantee for the token move (Phase 1) and the metrics backfill (Phase 5).

**B. New settings keys** (rows only, no DDL) in `SETTINGS_DEFAULTS` + `AppSettings` +
`getSettings` in `data.ts`:
`blocked_days=3`, `stuck_days=7`, `stale_days=14`, `chat_hours_in_combined='0'`,
`chats_last_import` (set at import time). Remove `github_token`/`vercel_token`/
`vercel_team_id` from the **typed** `AppSettings` and the Settings UI once Phase 1 lands
(they remain as harmless legacy rows; the migration reads them via raw `getSetting`).

---

## Phase 1 — Multiple accounts (foundational; touches sync)

### Migration `0002_v2_accounts` (`sql` + `run`)
`sql`:
```sql
create table if not exists accounts (
  id text primary key,
  provider text not null,           -- github | vercel
  label text not null,              -- "personal", "l8tency", "team-inferno"
  token text not null,
  team_id text,                     -- vercel team, nullable
  created_at text not null
);
alter table projects add column github_account_id text references accounts(id) on delete set null;
alter table projects add column vercel_account_id text references accounts(id) on delete set null;
create index if not exists idx_accounts_provider on accounts(provider);
```
`run` (token move — idempotent because migrations run once; **must leave current syncs
working with zero manual re-entry**):
- read `github_token`, `vercel_token`, `vercel_team_id` via `getSetting`.
- for each non-empty token, insert an `accounts` row labeled `"default"` (github row has
  null team_id; vercel row carries `vercel_team_id` if set).
- `update projects set github_account_id = <gh account id> where repo_full_name is not null`.
- `update projects set vercel_account_id = <vercel account id> where vercel_project_id is not null`.

### Types (`src/shared/types.ts`)
- `AccountProvider = 'github' | 'vercel'`.
- `Account { id, provider, label, token, team_id: string|null, created_at }`.
- `AccountInput { id?, provider, label, token, team_id?: string|null }`.
- add `github_account_id: string|null` and `vercel_account_id: string|null` to `Project`
  and `ProjectInput`.

### Data module (`src/main/db/data.ts`)
- `mapProject`: map the two new columns (`toStr`).
- `upsertProject`: add both columns to the insert column list, the values array, **and** the
  `on conflict(id) do update set` clause.
- new: `mapAccount`, `getAccounts`, `getAccount(id)`, `upsertAccount(input)`,
  `deleteAccount(id)`.

### Sync (`src/main/sync/github.ts`, `vercel.ts`)
- stop reading a global token from settings.
- github: `projects = getProjects().filter(p => p.repo_full_name && p.github_account_id)`.
  For each, resolve `getAccount(p.github_account_id)` → token. Projects with a repo but no
  linked account are **skipped** (not an error; surfaced as "needs account" in Phase 2).
- vercel: same shape using `p.vercel_account_id`; use that account's `team_id`.
- keep the existing per-repo/per-project try/catch isolation and partial-success messages.

### IPC / preload / api (all four layers, in order)
`ipc.ts`: `accountsList`, `accountsUpsert`, `accountsDelete`.
`register.ts`: wire each to the data fn.
`preload/index.ts`: `accounts.{list,upsert,remove}`.
`lib/api.ts`: typed `accounts` facade.

### Renderer
- `Settings.tsx`: new **Accounts section** (list + add/edit/remove: label, provider, token,
  optional team_id). Remove the three token fields.
- `ProjectFormModal.tsx`: two dropdowns (GitHub account / Vercel account) from `accounts.list`,
  writing `github_account_id` / `vercel_account_id`.

### Optional nicety — **skip** for now
Repo/Vercel-project autocomplete from a selected account's token.

### Done-when
`npm run typecheck` clean; a pre-migration DB (with tokens in settings + linked projects)
still syncs GitHub/Vercel after launch with no manual re-entry.

---

## Phase 2 — Richer Overview (data already held)
Extend `ProjectOverview` + `getProjectsOverview` (pure SQL over existing tables):
open task counts by stage + blocked count; oldest in-progress age; `last_activity_at`
(max of latest commit/deploy/session/chat — chat only after Phase 4); hours this week AND
this month, code vs chat distinct; `production_deploy_failed` flag (latest production deploy
ERROR/CANCELED); month-to-date cost (exists). Global strip via a small `getOverviewGlobals`
(active projects, total open, total blocked, combined MTD spend, hours this week). Renderer:
enrich `ProjectCard`, add global strip, "needs account" badge.

## Phase 3 — Combined cross-project task dashboard
Data: `getAllTasks(filter?: {project_id?, stage?, blocked_only?})` with project badge + age;
attention queries using `blocked_days`/`stuck_days`/`stale_days`. IPC `tasks:listAll`; **reuse**
`tasks:upsert`/`tasks:reorder` for inline edits. Renderer: new `TaskDashboard` view + nav
entry in `App.tsx` (`View` union gains `'tasks'`); grouping toggle, filters, sort, attention banner.

## Phase 4 — Chat export parser (manual, stale, no cost, hand-tagged — make that obvious in UI)
Dep: `fflate`. Parser in **main**, accepts `.zip` or extracted folder.
Migration `0003_v2_chats`: `create table chats (...)` per addendum + `idx_chats_project`.
Shared helper `src/main/lib/activeSeconds.ts` extracted from `claude.ts` `parseSession`
(behavior-preserving refactor); chat parser reuses it.
Parser `src/main/import/chatExport.ts`: locate `conversations.json`-style file; parse
defensively (missing/renamed keys, unknown message types, empty conversations); started/ended =
min/max message `created_at`; `active_seconds` via shared helper; `message_count`; no cost.
**Inspect a real export ZIP before locking field mappings** — keep the key map in one constant.
Data: `upsertChats` with `project_id = coalesce(chats.project_id, excluded.project_id)`;
`getChatsByProject`, `getUnassignedChats`, `assignChat`; set `chats_last_import`.
IPC: `chats:import` (opens `dialog.showOpenDialog` in main), `chats:list`, `chats:unassigned`,
`chats:assign`, `chats:byProject`. Chat hours are a **separate bucket** everywhere; combined
totals include them only if `chat_hours_in_combined='1'` (default off). Renderer: import button
+ visible last-import date + manual-nature note; untagged-chat assignment view modeled on
`UnassignedSessions.tsx`.

## Phase 5 — Insight over time
Dep: `recharts`. Migration `0004_v2_metrics`: `create table metrics_daily (...)` per addendum
(PK `(date, project_id)`). Data: `upsertMetricsForToday` (recompute today; call at end of
`runSync`); `backfillMetrics` as a migration `run` step (bucket sessions/chats/deployments/
completed tasks by day); `getMetricsRange` (weekly buckets; global = sum across project_id);
`getWeeklyDigest(weekStart, project_id?)` — deterministic, no LLM. Wire `upsertMetricsForToday`
into `sync/index.ts` after sources run. IPC `metrics:range`, `metrics:digest`. Renderer: new
`Insights` view + nav; recharts trend charts (stacked code-vs-chat hours, claude cost, tasks
completed, deploys); weekly digest panel with "copy as markdown". Infra cost stays monthly from
`costs`, charted separately.

## Build order (ship & confirm each before the next)
1. Multi-account → 2. Richer Overview → 3. Task dashboard → 4. Chat parser → 5. Insights.
