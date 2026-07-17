import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import type { Cost, CostInput, ProjectOverview } from '@shared/types'
import { CostFormModal } from '../components/CostFormModal'

// Full manual cost management across all projects. Vercel/Neon infra costs are
// entered here by hand too (no reliable per-project billing API); the `source`
// tag distinguishes them. Filter by month and source; add/edit/delete inline.
export function Costs(): JSX.Element {
  const [costs, setCosts] = useState<Cost[]>([])
  const [projects, setProjects] = useState<ProjectOverview[]>([])
  const [month, setMonth] = useState('')
  const [source, setSource] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Cost | null>(null)
  const [adding, setAdding] = useState(false)

  const projectName = useMemo(() => {
    const m = new Map(projects.map((p) => [p.id, p.name]))
    return (id: string | null): string => (id ? (m.get(id) ?? '—') : 'account-wide')
  }, [projects])

  const load = async (): Promise<void> => {
    setLoading(true)
    const [rows, ps] = await Promise.all([
      api.costs.list({ month: month || undefined, source: source || undefined }),
      api.projects.list()
    ])
    setCosts(rows)
    setProjects(ps)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [month, source])

  const save = async (input: CostInput): Promise<void> => {
    await api.costs.upsert(input)
    setEditing(null)
    setAdding(false)
    await load()
  }

  const remove = async (c: Cost): Promise<void> => {
    if (!confirm(`Delete cost "${c.description ?? c.source}" ($${c.amount_usd.toFixed(2)})?`)) return
    await api.costs.remove(c.id)
    await load()
  }

  const total = costs.reduce((sum, c) => sum + c.amount_usd, 0)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Costs</h1>
          <div className="sub">Across all projects · filter by month and source</div>
        </div>
        <div className="row">
          <input
            className="inp"
            type="month"
            style={{ width: 160 }}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <select
            className="inp"
            style={{ width: 130 }}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="">all sources</option>
            <option value="vercel">vercel</option>
            <option value="neon">neon</option>
            <option value="domain">domain</option>
            <option value="manual">manual</option>
          </select>
          <button className="btn primary" onClick={() => setAdding(true)}>
            + Add cost
          </button>
        </div>
      </div>

      {loading ? (
        <div className="spin">Loading…</div>
      ) : costs.length === 0 ? (
        <div className="empty">
          No cost entries{month || source ? ' for this filter' : ''}. Use <strong>Add cost</strong>{' '}
          for domains, infra, or anything else.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-faint)' }}>
              <th style={{ padding: '6px 8px' }}>Period</th>
              <th style={{ padding: '6px 8px' }}>Project</th>
              <th style={{ padding: '6px 8px' }}>Source</th>
              <th style={{ padding: '6px 8px' }}>Description</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {costs.map((c) => (
              <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="mono" style={{ padding: '6px 8px' }}>
                  {(c.period_start ?? c.created_at).slice(0, 7)}
                </td>
                <td style={{ padding: '6px 8px' }}>{projectName(c.project_id)}</td>
                <td style={{ padding: '6px 8px' }}>
                  <span className="badge">{c.source}</span>
                  {c.recurring && (
                    <span className="badge" style={{ marginLeft: 4 }}>
                      ↻ monthly
                    </span>
                  )}
                </td>
                <td style={{ padding: '6px 8px' }}>{c.description ?? '—'}</td>
                <td className="mono" style={{ padding: '6px 8px', textAlign: 'right' }}>
                  ${c.amount_usd.toFixed(2)}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button
                    className="btn ghost"
                    style={{ padding: '2px 8px' }}
                    onClick={() => setEditing(c)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn ghost"
                    style={{ padding: '2px 8px', color: 'var(--bad)' }}
                    onClick={() => remove(c)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: '1px solid var(--border-strong)' }}>
              <td colSpan={4} style={{ padding: '6px 8px', color: 'var(--text-dim)' }}>
                Total ({costs.length})
              </td>
              <td className="mono" style={{ padding: '6px 8px', textAlign: 'right' }}>
                ${total.toFixed(2)}
              </td>
              <td></td>
            </tr>
          </tbody>
        </table>
      )}

      {(adding || editing) && (
        <CostFormModal
          projects={projects}
          initial={editing ?? undefined}
          onSubmit={save}
          onCancel={() => {
            setAdding(false)
            setEditing(null)
          }}
        />
      )}
    </>
  )
}
