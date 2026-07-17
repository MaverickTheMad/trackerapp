import { useState } from 'react'
import type { Task, TaskInput, TaskStage } from '@shared/types'

const STAGES: TaskStage[] = ['backlog', 'in_progress', 'blocked', 'shipped']

// Create/edit a task. project_id is fixed by the caller (the board it lives on).
export function TaskFormModal({
  projectId,
  initial,
  onSubmit,
  onCancel,
  onDelete
}: {
  projectId: string
  initial?: Task
  onSubmit: (input: TaskInput) => Promise<void>
  onCancel: () => void
  onDelete?: () => Promise<void>
}): JSX.Element {
  const [form, setForm] = useState<TaskInput>({
    id: initial?.id,
    project_id: projectId,
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    stage: initial?.stage ?? 'backlog',
    estimate_hours: initial?.estimate_hours ?? null,
    adjust_hours: initial?.adjust_hours ?? 0,
    sort_order: initial?.sort_order ?? 0
  })
  const [busy, setBusy] = useState(false)

  const set = (patch: Partial<TaskInput>): void => setForm((f) => ({ ...f, ...patch }))

  const submit = async (): Promise<void> => {
    if (!form.title.trim()) return
    setBusy(true)
    try {
      await onSubmit({ ...form, title: form.title.trim(), description: form.description || null })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{initial ? 'Edit task' : 'New task'}</h2>

        <label className="field">
          <span className="lab">Title</span>
          <input
            className="inp"
            autoFocus
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>

        <label className="field">
          <span className="lab">Description</span>
          <textarea
            className="inp"
            rows={3}
            value={form.description ?? ''}
            onChange={(e) => set({ description: e.target.value })}
          />
        </label>

        <div className="row" style={{ gap: 12 }}>
          <label className="field" style={{ flex: 1 }}>
            <span className="lab">Stage</span>
            <select
              className="inp"
              value={form.stage}
              onChange={(e) => set({ stage: e.target.value as TaskStage })}
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ width: 130 }}>
            <span className="lab">Estimate (h)</span>
            <input
              className="inp"
              type="number"
              step="0.25"
              min={0}
              value={form.estimate_hours ?? ''}
              onChange={(e) =>
                set({ estimate_hours: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </label>
          <label className="field" style={{ width: 130 }}>
            <span className="lab">Adjust (h)</span>
            <input
              className="inp"
              type="number"
              step="0.25"
              value={form.adjust_hours ?? 0}
              onChange={(e) => set({ adjust_hours: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="hint" style={{ marginTop: -6, marginBottom: 14 }}>
          Adjust adds off-Claude hours (or subtracts) into this project's total, by hand.
        </div>

        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <div>
            {onDelete && (
              <button
                className="btn ghost"
                style={{ color: 'var(--bad)' }}
                onClick={async () => {
                  if (confirm(`Delete task "${initial?.title}"?`)) await onDelete()
                }}
              >
                Delete
              </button>
            )}
          </div>
          <div className="row">
            <button className="btn ghost" onClick={onCancel}>
              Cancel
            </button>
            <button className="btn primary" onClick={submit} disabled={busy || !form.title.trim()}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
