import { app } from 'electron'
import { join, dirname } from 'path'
import { existsSync, copyFileSync, statSync } from 'fs'
import { createClient, type Client } from '@libsql/client'

// Desktop-specific glue: builds a local file: URL under Electron's userData dir
// and returns a libSQL client. This is the ONLY place that decides where the DB
// lives. The portable data module (./data.ts) never constructs a client itself —
// it receives one — so the future web app can hand it a Turso remote/replica
// client instead (embedded-replica config: same file `url` + `syncUrl` + `authToken`).

// One-time rescue for data created before app.setName('trackerapp') was pinned:
// `electron-vite dev` used to report the name "Electron", writing the DB to a
// sibling %APPDATA%/Electron dir. If the canonical DB doesn't exist yet but that
// legacy one does (and is non-empty), copy it over so no work is lost. Safe and
// idempotent: only runs when the destination is absent.
function migrateLegacyDb(dbPath: string): void {
  if (existsSync(dbPath)) return
  const legacy = join(dirname(dirname(dbPath)), 'Electron', 'trackerapp.db')
  try {
    if (existsSync(legacy) && statSync(legacy).size > 0) {
      copyFileSync(legacy, dbPath)
      console.log(`[db] migrated legacy database from ${legacy}`)
    }
  } catch (err) {
    console.warn('[db] legacy migration skipped:', err instanceof Error ? err.message : err)
  }
}

export function createDbClient(): Client {
  const dbPath = join(app.getPath('userData'), 'trackerapp.db')
  migrateLegacyDb(dbPath)
  // file: URL with forward slashes works cross-platform for libSQL.
  const url = `file:${dbPath.replace(/\\/g, '/')}`
  return createClient({ url })
}
