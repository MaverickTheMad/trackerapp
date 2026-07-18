import type { Client } from '@libsql/client'
import type { SyncStatus } from '@shared/types'
import { upsertMetricsForToday } from '../db/data'
import { syncGithub } from './github'
import { syncVercel } from './vercel'
import { syncClaude } from './claude'

// Sync orchestrator. Runs from the main process: once on launch, on a timer, and
// on manual Refresh. Each source is isolated so one failing (e.g. a missing token)
// never blocks the others. GitHub/Vercel land in Phase 2, the Claude parser in
// Phase 4 — the stubs below keep `sync:run`/`sync:status` wired end-to-end now.

let status: SyncStatus = {
  phase: 'idle',
  last_run_at: null,
  last_error: null,
  sources: {}
}

let inFlight: Promise<SyncStatus> | null = null

export function getSyncStatus(): SyncStatus {
  return status
}

type SourceResult = { ok: boolean; message: string }

async function runSource(
  name: string,
  fn: () => Promise<string>,
  results: Record<string, SourceResult>
): Promise<void> {
  try {
    const message = await fn()
    results[name] = { ok: true, message }
  } catch (err) {
    results[name] = { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

export async function runSync(client: Client): Promise<SyncStatus> {
  // Collapse concurrent triggers (timer firing while a manual refresh runs).
  if (inFlight) return inFlight

  inFlight = (async () => {
    status = { ...status, phase: 'running', last_error: null }
    const results: Record<string, SourceResult> = {}

    await runSource('github', () => syncGithub(client), results)
    await runSource('vercel', () => syncVercel(client), results)
    await runSource('claude', () => syncClaude(client), results)

    // Refresh today's metrics after sources land. Isolated like a source so a
    // failure here surfaces in status without blowing up the whole sync.
    await runSource(
      'metrics',
      async () => {
        await upsertMetricsForToday(client)
        return "today's metrics recomputed"
      },
      results
    )

    const anyError = Object.values(results).some((r) => !r.ok)
    status = {
      phase: anyError ? 'error' : 'idle',
      last_run_at: new Date().toISOString(),
      last_error: anyError
        ? Object.entries(results)
            .filter(([, r]) => !r.ok)
            .map(([n, r]) => `${n}: ${r.message}`)
            .join('; ')
        : null,
      sources: results
    }
    return status
  })()

  try {
    return await inFlight
  } finally {
    inFlight = null
  }
}

// GitHub + Vercel live in ./github.ts and ./vercel.ts (Phase 2); the Claude log
// parser in ./claude.ts (Phase 4).
