import { useState } from 'react'
import type { Cost, CostInput, CostSource, ProjectOverview } from '@shared/types'

const SOURCES: CostSource[] = ['vercel', 'neon', 'domain', 'manual']

// month 'YYYY-MM' <-> stored ISO period_start. Costs are bucketed by month; the
// Costs view and Overview both filter on substr(period_start,1,7).
function monthToIso(month: string): string | null {
  return month ? `${month}-01T00:00:00.000Z` : null
}
function isoToMonth(iso: string | null): string {
  return iso ? iso.slice(0, 7) : ''
}

export function CostFormModal({
  projects,
  initial,
  defaultProjectId,
  onSubmit,
  onCancel
}: {
  projects: ProjectOverview[]
  initial?: Cost
  defaultProjectId?: string
  onSubmit: (input: CostInput) => Promise<void>
  onCancel: () => void
}): JSX.Element {
  const nowMonth = new Date().toISOString().slice(0, 7)
  const [form, setForm] = useState({
    id: initial?.id,
    project_id: initial?.project_id ?? defaultProjectId ?? '',
    source: (initial?.source ?? 'domain') as CostSource,
    description: initial?.description ?? '',
    amount_usd: initial?.amount_usd ?? 0,
    month: isoToMonth(initial?.period_start ?? null) || nowMonth,
    recurring: initial?.recurring ?? false
  })
  const [busy, setBusy] = useState(false)

  const set = (patch: Partial<typeof form>): void => setForm((f) => ({ ...f, ...patch }))

  const submit = async (): Promise<void> => {
    setBusy(true)
    try {
      await onSubmit({
        id: form.id,
        project_id: form.project_id || null, // '' → account-wide
        source: form.source,
        description: form.description || null,
        amount_usd: Number(form.amount_usd),
        period_start: monthToIso(form.month),
        period_end: null,
        recurring: form.recurring
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{initial ? 'Edit cost' : 'Add cost'}</h2>

        <div className="row" style={{ gap: 12 }}>
          <label className="field" style={{ flex: 1 }}>
            <span className="lab">Project</span>
            <select
              className="inp"
              value={form.project_id}
              onChange={(e) => set({ project_id: e.target.value })}
            >
              <option value="">— account-wide —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ width: 140 }}>
            <span className="lab">Source</span>
            <select
              className="inp"
              value={form.source}
              onChange={(e) => set({ source: e.target.value as CostSource })}
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span className="lab">Description</span>
          <input
            className="inp"
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="e.g. domain renewal — heardle.app"
          />
        </label>

        <div className="row" style={{ gap: 12 }}>
          <label className="field" style={{ flex: 1 }}>
            <span className="lab">Amount (USD)</span>
            <input
              className="inp"
              type="number"
              step="0.01"
              min={0}
              value={form.amount_usd}
              onChange={(e) => set({ amount_usd: Number(e.target.value) })}
            />
          </label>
          <label className="field" style={{ width: 160 }}>
            <span className="lab">Month</span>
            <input
              className="inp"
              type="month"
              value={form.month}
              onChange={(e) => set({ month: e.target.value })}
            />
          </label>
        </div>

        <label className="row" style={{ gap: 8, marginBottom: 16, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.recurring}
            onChange={(e) => set({ recurring: e.target.checked })}
          />
          <span>Recurring (monthly) — informational tag</span>
        </label>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
