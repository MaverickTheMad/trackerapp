import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { ClaudeSession, ProjectOverview } from '@shared/types'

const hrs = (secs: number): string => (secs / 3600).toFixed(1)

// Lists Claude sessions whose cwd matched no project, so they can be assigned by
// hand. Assigning is preserved across re-parses (upsertSessions coalesces).
export function UnassignedSessions({
  projects,
  onClose,
  onAssigned
}: {
  projects: ProjectOverview[]
  onClose: () => void
  onAssigned: () => void
}): JSX.Element {
  const [sessions, setSessions] = useState<ClaudeSession[]>([])
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void api.sessions.unassigned().then((s) => {
      setSessions(s)
      setLoading(false)
    })
  }, [])

  const assign = async (sessionId: string): Promise<void> => {
    const projectId = choice[sessionId]
    if (!projectId) return
    await api.sessions.assign(sessionId, projectId)
    setSessions((cur) => cur.filter((s) => s.id !== sessionId))
    onAssigned()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 720 }} onClick={(e) => e.stopPropagation()}>
        <h2>Unassigned Claude sessions</h2>
        {loading ? (
          <div className="spin">Loading…</div>
        ) : sessions.length === 0 ? (
          <div className="empty">All sessions are assigned. 🎉</div>
        ) : projects.length === 0 ? (
          <div className="empty">Create a project first, then assign these to it.</div>
        ) : (
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-faint)' }}>
                  <th style={{ padding: '6px 6px' }}>cwd</th>
                  <th style={{ padding: '6px 6px' }}>model</th>
                  <th style={{ padding: '6px 6px', textAlign: 'right' }}>hrs</th>
                  <th style={{ padding: '6px 6px', textAlign: 'right' }}>cost</th>
                  <th style={{ padding: '6px 6px' }}>assign to</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="mono" style={{ padding: '6px 6px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.claude_cwd ?? '—'}
                    </td>
                    <td style={{ padding: '6px 6px' }}>{s.model ?? '—'}</td>
                    <td className="mono" style={{ padding: '6px 6px', textAlign: 'right' }}>
                      {hrs(s.active_seconds)}
                    </td>
                    <td className="mono" style={{ padding: '6px 6px', textAlign: 'right' }}>
                      ${s.est_cost_usd.toFixed(2)}
                    </td>
                    <td style={{ padding: '6px 6px' }}>
                      <select
                        className="inp"
                        style={{ padding: '4px 6px' }}
                        value={choice[s.id] ?? ''}
                        onChange={(e) => setChoice((c) => ({ ...c, [s.id]: e.target.value }))}
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
                        disabled={!choice[s.id]}
                        onClick={() => assign(s.id)}
                      >
                        Assign
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
