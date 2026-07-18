import { readFile, readdir, stat } from 'fs/promises'
import { join, basename } from 'path'
import { unzipSync, strFromU8 } from 'fflate'
import type { Chat, ChatKind, Project } from '@shared/types'
import { activeSeconds } from '../lib/activeSeconds'

// Parses a Claude data export into normalized `chats` rows. Runs in main (Node):
// accepts a `.zip` (read via fflate) OR an already-extracted folder. Manual,
// point-in-time, no cost — see the phase notes. Tolerant of missing/renamed keys,
// unknown message types, and empty message arrays.
//
// ── VERIFIED field map (single place that touches raw export shape) ───────────
// The export has TWO chat schemas:
//
//   A. Regular — `conversations.json` (ARRAY of conversations):
//      conversation: uuid, name, summary, created_at, updated_at, chat_messages[]
//                    (no project field → imported untagged for manual tagging)
//      message:      created_at (ISO `…Z`), sender, text, content[]
//
//   B. Design — `design_chats/*.json` (ONE object per file):
//      object:  uuid, title (NOT name), project{ uuid, name }, created_at,
//               updated_at, messages[] (NOT chat_messages)
//      message: created_at (ISO `+00:00` offset), role (NOT sender), content
//
// All schema-specific access is confined to parseRegular / parseDesign below.
// Everything downstream works off the normalized Chat shape.

type Raw = Record<string, unknown>
const asObj = (v: unknown): Raw | null => (v && typeof v === 'object' ? (v as Raw) : null)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

// Date.parse handles both the `…Z` and `+00:00` offset forms; re-emit as ISO-Z.
function normISO(s: string): string {
  const t = Date.parse(s)
  return Number.isNaN(t) ? s : new Date(t).toISOString()
}

function messageTimestamps(messages: unknown[]): number[] {
  const out: number[] = []
  for (const m of messages) {
    const created = str(asObj(m)?.created_at)
    if (created == null) continue
    const t = Date.parse(created)
    if (!Number.isNaN(t)) out.push(t)
  }
  return out
}

// ── Design-chat project auto-match (conservative, mirrors claude.ts style) ────
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function matchDesignProject(name: string | null, projects: Project[]): string | null {
  if (!name) return null
  const target = normalizeName(name)
  if (!target) return null
  // Exact normalized name — but only if unambiguous.
  const exact = projects.filter((p) => normalizeName(p.name) === target)
  if (exact.length === 1) return exact[0].id
  if (exact.length > 1) return null
  // Then a confident UNIQUE contains-match, either direction.
  const contains = projects.filter((p) => {
    const pn = normalizeName(p.name)
    return pn.length > 0 && (pn.includes(target) || target.includes(pn))
  })
  return contains.length === 1 ? contains[0].id : null
}

// ── Normalize one conversation (either schema) → Chat ─────────────────────────
function buildChat(opts: {
  id: string
  name: string | null
  summary: string | null
  kind: ChatKind
  messages: unknown[]
  convCreated: string | null
  convUpdated: string | null
  project_id: string | null
  source: string
  idleCap: number
}): Chat | null {
  if (!opts.id) return null
  const ts = messageTimestamps(opts.messages)

  let startedAt: string
  let endedAt: string
  if (ts.length > 0) {
    ts.sort((a, b) => a - b)
    startedAt = new Date(ts[0]).toISOString()
    endedAt = new Date(ts[ts.length - 1]).toISOString()
  } else {
    // No datable messages (e.g. empty conversation): fall back to conversation-
    // level created_at/updated_at so nothing is dropped.
    const c = opts.convCreated ?? opts.convUpdated
    const u = opts.convUpdated ?? opts.convCreated
    if (!c || !u) return null // truly nothing datable
    startedAt = normISO(c)
    endedAt = normISO(u)
  }

  return {
    id: opts.id,
    project_id: opts.project_id,
    name: opts.name,
    summary: opts.summary,
    kind: opts.kind,
    message_count: opts.messages.length,
    started_at: startedAt,
    ended_at: endedAt,
    active_seconds: activeSeconds(ts, opts.idleCap),
    source_export: opts.source,
    created_at: opts.convCreated ? normISO(opts.convCreated) : startedAt,
    updated_at: opts.convUpdated ? normISO(opts.convUpdated) : null,
    imported_at: new Date().toISOString()
  }
}

function parseRegular(raw: unknown, source: string, idleCap: number): Chat | null {
  const conv = asObj(raw)
  if (!conv) return null
  const id = str(conv.uuid)
  if (!id) return null
  return buildChat({
    id,
    name: str(conv.name),
    summary: str(conv.summary),
    kind: 'regular',
    messages: arr(conv.chat_messages),
    convCreated: str(conv.created_at),
    convUpdated: str(conv.updated_at),
    project_id: null, // regular chats are always imported untagged
    source,
    idleCap
  })
}

function parseDesign(
  raw: unknown,
  projects: Project[],
  source: string,
  idleCap: number
): Chat | null {
  const obj = asObj(raw)
  if (!obj) return null
  const id = str(obj.uuid)
  if (!id) return null
  const projName = str(asObj(obj.project)?.name)
  return buildChat({
    id,
    name: str(obj.title), // design chats use `title`
    // Stash the Claude-project name so origin is visible even when unmatched.
    summary: projName ? `Claude project: ${projName}` : null,
    kind: 'design',
    messages: arr(obj.messages), // design chats use `messages`
    convCreated: str(obj.created_at),
    convUpdated: str(obj.updated_at),
    project_id: matchDesignProject(projName, projects),
    source,
    idleCap
  })
}

// ── Input readers: locate the two schemas in a folder or a zip ────────────────
const DESIGN_RE = /(^|\/)design_chats\/[^/]+\.json$/

async function readFromFolder(
  root: string
): Promise<{ convText: string | null; designTexts: string[] }> {
  let convText: string | null = null
  const designTexts: string[] = []
  const walk = async (dir: string): Promise<void> => {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === 'design_chats') {
          let files: string[] = []
          try {
            files = await readdir(full)
          } catch {
            /* unreadable — skip */
          }
          for (const f of files) {
            if (!f.endsWith('.json')) continue
            try {
              designTexts.push(await readFile(join(full, f), 'utf8'))
            } catch {
              /* skip unreadable file */
            }
          }
        } else {
          await walk(full)
        }
      } else if (e.name === 'conversations.json' && !convText) {
        try {
          convText = await readFile(full, 'utf8')
        } catch {
          /* skip */
        }
      }
    }
  }
  await walk(root)
  return { convText, designTexts }
}

function readFromZip(bytes: Uint8Array): { convText: string | null; designTexts: string[] } {
  // Only decompress the files we care about (skips projects/, memories.json, …).
  const files = unzipSync(bytes, {
    filter: (f) => f.name.endsWith('conversations.json') || DESIGN_RE.test(f.name)
  })
  let convText: string | null = null
  const designTexts: string[] = []
  for (const [name, data] of Object.entries(files)) {
    if (!data || data.length === 0) continue
    if (name.endsWith('conversations.json')) convText = strFromU8(data)
    else if (DESIGN_RE.test(name)) designTexts.push(strFromU8(data))
  }
  return { convText, designTexts }
}

export async function parseChatExport(
  inputPath: string,
  projects: Project[],
  idleCap: number
): Promise<Chat[]> {
  const source = basename(inputPath)
  const info = await stat(inputPath)

  const { convText, designTexts } = info.isDirectory()
    ? await readFromFolder(inputPath)
    : readFromZip(new Uint8Array(await readFile(inputPath)))

  const chats: Chat[] = []

  if (convText) {
    let parsed: unknown = null
    try {
      parsed = JSON.parse(convText)
    } catch {
      parsed = null // corrupt file — import nothing rather than throwing
    }
    for (const conv of arr(parsed)) {
      const c = parseRegular(conv, source, idleCap)
      if (c) chats.push(c)
    }
  }

  for (const text of designTexts) {
    let parsed: unknown = null
    try {
      parsed = JSON.parse(text)
    } catch {
      continue // skip a single corrupt design file
    }
    const c = parseDesign(parsed, projects, source, idleCap)
    if (c) chats.push(c)
  }

  return chats
}
