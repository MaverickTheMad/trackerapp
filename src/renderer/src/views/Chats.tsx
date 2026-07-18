import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Chat, ProjectOverview } from '@shared/types'
import { ago } from '../lib/time'

const hrs = (secs: number): string => (secs / 3600).toFixed(1)

// Chats surface: import a Claude data export, then hand-tag any untagged chats.
// Chat time is a SEPARATE bucket from Claude-session (code) hours — never merged.
export function Chats(): JSX.Element {
  const [chats, setChats] = useState<Chat[]>([])
  const [unassigned, setUnassigned] = useState<Chat[]>([])
  const [projects, setProjects] = useState<ProjectOverview[]>([])
  const [lastImport, setLastImport] = useState<string>('')
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    const [all, un, p, s] = await Promise.all([
      api.chats.list(),
      api.chats.unassigned(),
      api.projects.list(),
      api.settings.get()
    ])
    setChats(all)
    setUnassigned(un)
    setProjects(p)
    setLastImport(s.chats_last_import)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const runImport = async (): Promise<void> => {
    setImporting(true)
    setNote(null)
    try {
      const res = await api.chats.import()
      if (res.canceled) setNote('Import canceled.')
      else setNote(`Imported ${res.imported} chat${res.imported === 1 ? '' : 's'}.`)
      await load()
    } finally {
      setImporting(false)
    }
  }

  const assign = async (chatId: string): Promise<void> => {
    const projectId = choice[chatId]
    if (!projectId) return
    await api.chats.assign(chatId, projectId)
    setUnassigned((cur) => cur.filter((c) => c.id !== chatId))
    await load()
  }

  const chatHours = chats.reduce((s, c) => s + c.active_seconds, 0) / 3600

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Chats</h1>
          <div className="sub">
            {chats.length} imported · {hrs(chats.reduce((s, c) => s + c.active_seconds, 0))}h (own
            bucket, not merged into code hours)
          </div>
        </div>
        <div className="row">
          <button className="btn primary" onClick={runImport} disabled={importing}>
            {importing ? 'Importing…' : 'Import chat export'}
          </button>
        </div>
      </div>

      <div className="banner">
        <strong>Manual, point-in-time import.</strong> Chats are read once from a Claude data-export
        ZIP you pick — they are <em>not</em> auto-synced, carry <em>no cost</em>, and are{' '}
        <em>hand-tagged</em> to projects (design chats try to auto-match their Claude project).
        Chat hours stay in their own bucket, separate from Claude-session code hours.
        <div className="hint" style={{ marginTop: 6 }}>
          Last import: {lastImport ? new Date(lastImport).toLocaleString() : 'never'}
          {note ? ` · ${note}` : ''}
        </div>
      </div>

      {loading ? (
        <div className="spin">Loading…</div>
      ) : chats.length === 0 ? (
        <div className="empty">
          No chats yet. Click <strong>Import chat export</strong> and pick your Claude export ZIP.
        </div>
      ) : (
        <>
          <div className="metrics" style={{ maxWidth: 520, marginBottom: 22 }}>
            <div className="metric">
              <div className="label">Chats</div>
              <div className="value">{chats.length}</div>
            </div>
            <div className="metric">
              <div className="label">Untagged</div>
              <div className="value">{unassigned.length}</div>
            </div>
            <div className="metric">
              <div className="label">Chat hours</div>
              <div className="value">{chatHours.toFixed(1)}</div>
            </div>
          </div>

          <section className="section">
            <h2 className="section-title">
              Untagged chats <span className="count">{unassigned.length}</span>
            </h2>
            {unassigned.length === 0 ? (
              <div className="empty">Every chat is tagged to a project. 🎉</div>
            ) : projects.length === 0 ? (
              <div className="empty">Create a project first, then tag these to it.</div>
            ) : (
              <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-faint)' }}>
                      <th style={{ padding: '6px 6px' }}>chat</th>
                      <th style={{ padding: '6px 6px' }}>kind</th>
                      <th style={{ padding: '6px 6px', textAlign: 'right' }}>msgs</th>
                      <th style={{ padding: '6px 6px', textAlign: 'right' }}>hrs</th>
                      <th style={{ padding: '6px 6px' }}>started</th>
                      <th style={{ padding: '6px 6px' }}>tag to</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {unassigned.map((c) => (
                      <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td
                          style={{
                            padding: '6px 6px',
                            maxWidth: 240,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={c.summary ?? undefined}
                        >
                          {c.name ?? '(untitled)'}
                        </td>
                        <td style={{ padding: '6px 6px' }}>
                          <span className="badge">{c.kind}</span>
                        </td>
                        <td className="mono" style={{ padding: '6px 6px', textAlign: 'right' }}>
                          {c.message_count}
                        </td>
                        <td className="mono" style={{ padding: '6px 6px', textAlign: 'right' }}>
                          {hrs(c.active_seconds)}
                        </td>
                        <td className="mono" style={{ padding: '6px 6px' }}>
                          {ago(c.started_at)}
                        </td>
                        <td style={{ padding: '6px 6px' }}>
                          <select
                            className="inp"
                            style={{ padding: '4px 6px' }}
                            value={choice[c.id] ?? ''}
                            onChange={(e) =>
                              setChoice((cur) => ({ ...cur, [c.id]: e.target.value }))
                            }
                          >
                            <option value="">— pick —</option>
                            {projects.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '6px 6px' }}>
                          <button
                            className="btn"
                            style={{ padding: '4px 10px' }}
                            disabled={!choice[c.id]}
                            onClick={() => assign(c.id)}
                          >
                            Tag
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  )
}
