import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import type { Client } from '@libsql/client'
import { getProjects, getSetting, upsertSessions } from '../db/data'
import type { ClaudeSession, Project } from '@shared/types'
import { estimateCostUsd } from './pricing'
import { activeSeconds } from '../lib/activeSeconds'

// In-process Claude Code log parser. Reads <home>/.claude/projects/**/*.jsonl
// (one file per session) directly — no collector, no network. Idempotent: keyed
// on session id, so re-running never double-counts. See the log-format notes:
// each line is a JSON record; assistant records carry `message.model` and
// `message.usage` with input/output/cache token counts; every record has an ISO
// `timestamp`; `cwd` is an absolute path used to match a project.

const DEFAULT_IDLE_CAP = 1800

interface Usage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}
interface LogRecord {
  type?: string
  timestamp?: string
  sessionId?: string
  cwd?: string
  message?: { role?: string; model?: string; usage?: Usage }
}

// ── Path helpers ──────────────────────────────────────────────────────────────
function normalizePath(p: string): string {
  return p.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

// Best-effort decode of the folder name when a session has no `cwd` record.
// Claude encodes e.g. "D:\trackerapp" -> "D--trackerapp". Hyphens inside real
// names are ambiguous, so this is a fallback only; `cwd` from records is preferred.
function decodeFolderName(folder: string): string | null {
  const m = folder.match(/^([A-Za-z])--(.+)$/)
  if (!m) return null
  return `${m[1]}:\\${m[2].replace(/-/g, '\\')}`
}

function matchProject(cwd: string | null, projects: Project[]): string | null {
  if (!cwd) return null
  const target = normalizePath(cwd)
  // Exact first.
  for (const p of projects) {
    if (p.claude_cwd && normalizePath(p.claude_cwd) === target) return p.id
  }
  // Then suffix either direction (project path is a tail of session cwd or vice versa).
  for (const p of projects) {
    if (!p.claude_cwd) continue
    const pc = normalizePath(p.claude_cwd)
    if (target.endsWith('/' + pc) || pc.endsWith('/' + target)) return p.id
  }
  return null
}

// ── Per-file parse ────────────────────────────────────────────────────────────
function parseSession(
  fileStem: string,
  folder: string,
  contents: string,
  idleCap: number,
  projects: Project[]
): ClaudeSession | null {
  const timestamps: number[] = []
  let sessionId = fileStem
  let cwd: string | null = null
  let model: string | null = null
  const tokens = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0
  }

  for (const line of contents.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let rec: LogRecord
    try {
      rec = JSON.parse(trimmed)
    } catch {
      continue // skip malformed lines rather than failing the whole file
    }

    if (rec.sessionId) sessionId = rec.sessionId
    if (!cwd && rec.cwd) cwd = rec.cwd
    if (rec.timestamp) {
      const t = Date.parse(rec.timestamp)
      if (!Number.isNaN(t)) timestamps.push(t)
    }
    if (rec.type === 'assistant' && rec.message) {
      if (rec.message.model) model = rec.message.model // last assistant model wins
      const u = rec.message.usage
      if (u) {
        tokens.input_tokens += u.input_tokens ?? 0
        tokens.output_tokens += u.output_tokens ?? 0
        tokens.cache_read_tokens += u.cache_read_input_tokens ?? 0
        tokens.cache_creation_tokens += u.cache_creation_input_tokens ?? 0
      }
    }
  }

  if (timestamps.length === 0) return null // nothing datable; skip

  timestamps.sort((a, b) => a - b)
  const started = timestamps[0]
  const ended = timestamps[timestamps.length - 1]

  // active_seconds: idle-capped sum of consecutive gaps (shared helper).
  const activeSecs = activeSeconds(timestamps, idleCap)

  if (!cwd) cwd = decodeFolderName(folder)

  return {
    id: sessionId,
    project_id: matchProject(cwd, projects),
    claude_cwd: cwd,
    model,
    started_at: new Date(started).toISOString(),
    ended_at: new Date(ended).toISOString(),
    active_seconds: activeSecs,
    ...tokens,
    est_cost_usd: estimateCostUsd(model, tokens),
    ingested_at: new Date().toISOString()
  }
}

// ── Directory scan ────────────────────────────────────────────────────────────
async function findSessionFiles(root: string): Promise<{ folder: string; file: string }[]> {
  const out: { folder: string; file: string }[] = []
  let folders: string[]
  try {
    const entries = await readdir(root, { withFileTypes: true })
    folders = entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return out // projects dir doesn't exist yet
  }
  for (const folder of folders) {
    try {
      const files = await readdir(join(root, folder))
      for (const f of files) {
        if (f.endsWith('.jsonl')) out.push({ folder, file: join(root, folder, f) })
      }
    } catch {
      /* unreadable subdir — skip */
    }
  }
  return out
}

export async function syncClaude(client: Client): Promise<string> {
  const root = join(homedir(), '.claude', 'projects')
  const files = await findSessionFiles(root)
  if (files.length === 0) return 'no Claude logs found'

  const idleCapRaw = await getSetting(client, 'idle_cap_seconds')
  const idleCap = idleCapRaw ? Number(idleCapRaw) : DEFAULT_IDLE_CAP
  const projects = await getProjects(client)

  const sessions: ClaudeSession[] = []
  let skipped = 0
  for (const { folder, file } of files) {
    try {
      const contents = await readFile(file, 'utf8')
      const stem = file.slice(file.lastIndexOf('/') + 1).replace(/\.jsonl$/, '')
      const session = parseSession(stem, folder, contents, idleCap, projects)
      if (session) sessions.push(session)
      else skipped++
    } catch {
      skipped++
    }
  }

  await upsertSessions(client, sessions)
  const matched = sessions.filter((s) => s.project_id).length
  const unmatched = sessions.length - matched
  return `${sessions.length} sessions (${matched} matched, ${unmatched} unassigned${
    skipped ? `, ${skipped} skipped` : ''
  })`
}
