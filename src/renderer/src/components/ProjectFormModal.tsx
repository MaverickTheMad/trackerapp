import { useEffect, useState } from 'react'
import type { ProjectInput, Project, ProjectStatus, Account } from '@shared/types'
import { api } from '../lib/api'

// Create/edit a project. Used by Overview (add) and reusable for edit later.
export function ProjectFormModal({
  title,
  initial,
  onSubmit,
  onCancel
}: {
  title: string
  initial?: Project
  onSubmit: (input: ProjectInput) => Promise<void>
  onCancel: () => void
}): JSX.Element {
  const [form, setForm] = useState<ProjectInput>({
    id: initial?.id,
    name: initial?.name ?? '',
    slug: initial?.slug ?? '',
    repo_full_name: initial?.repo_full_name ?? '',
    vercel_project_id: initial?.vercel_project_id ?? '',
    neon_project_id: initial?.neon_project_id ?? '',
    claude_cwd: initial?.claude_cwd ?? '',
    status: initial?.status ?? 'active',
    github_account_id: initial?.github_account_id ?? null,
    vercel_account_id: initial?.vercel_account_id ?? null
  })
  const [saving, setSaving] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])

  useEffect(() => {
    void api.accounts.list().then(setAccounts)
  }, [])

  const githubAccounts = accounts.filter((a) => a.provider === 'github')
  const vercelAccounts = accounts.filter((a) => a.provider === 'vercel')

  const set = (patch: Partial<ProjectInput>): void => setForm((f) => ({ ...f, ...patch }))

  const submit = async (): Promise<void> => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await onSubmit({
        ...form,
        name: form.name.trim(),
        repo_full_name: form.repo_full_name || null,
        vercel_project_id: form.vercel_project_id || null,
        neon_project_id: form.neon_project_id || null,
        claude_cwd: form.claude_cwd || null,
        github_account_id: form.github_account_id || null,
        vercel_account_id: form.vercel_account_id || null
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>

        <label className="field">
          <span className="lab">Name</span>
          <input
            className="inp"
            autoFocus
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Heardle"
          />
        </label>

        <label className="field">
          <span className="lab">Slug</span>
          <input
            className="inp"
            value={form.slug}
            onChange={(e) => set({ slug: e.target.value })}
            placeholder="auto from name if left blank"
          />
        </label>

        <div className="row" style={{ gap: 12 }}>
          <label className="field" style={{ flex: 1 }}>
            <span className="lab">GitHub repo (owner/repo)</span>
            <input
              className="inp"
              value={form.repo_full_name ?? ''}
              onChange={(e) => set({ repo_full_name: e.target.value })}
              placeholder="mpaulreilly/heardle"
            />
          </label>
          <label className="field" style={{ width: 150 }}>
            <span className="lab">Status</span>
            <select
              className="inp"
              value={form.status}
              onChange={(e) => set({ status: e.target.value as ProjectStatus })}
            >
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="archived">archived</option>
            </select>
          </label>
        </div>

        <label className="field">
          <span className="lab">GitHub account</span>
          <select
            className="inp"
            value={form.github_account_id ?? ''}
            onChange={(e) => set({ github_account_id: e.target.value || null })}
          >
            <option value="">none</option>
            {githubAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <span className="hint">Which linked GitHub credential to sync this repo with.</span>
        </label>

        <div className="row" style={{ gap: 12 }}>
          <label className="field" style={{ flex: 1 }}>
            <span className="lab">Vercel project id</span>
            <input
              className="inp"
              value={form.vercel_project_id ?? ''}
              onChange={(e) => set({ vercel_project_id: e.target.value })}
            />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span className="lab">Neon project id</span>
            <input
              className="inp"
              value={form.neon_project_id ?? ''}
              onChange={(e) => set({ neon_project_id: e.target.value })}
            />
          </label>
        </div>

        <label className="field">
          <span className="lab">Vercel account</span>
          <select
            className="inp"
            value={form.vercel_account_id ?? ''}
            onChange={(e) => set({ vercel_account_id: e.target.value || null })}
          >
            <option value="">none</option>
            {vercelAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <span className="hint">Which linked Vercel credential to sync this project with.</span>
        </label>

        <label className="field">
          <span className="lab">Claude cwd (absolute path)</span>
          <input
            className="inp"
            value={form.claude_cwd ?? ''}
            onChange={(e) => set({ claude_cwd: e.target.value })}
            placeholder="D:\heardle"
          />
          <span className="hint">
            Matches Claude Code sessions to this project. Use the exact path you launch Claude from.
          </span>
        </label>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={saving || !form.name.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
