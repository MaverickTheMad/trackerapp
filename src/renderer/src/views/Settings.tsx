import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { AppSettings } from '@shared/types'
import { UpdatePanel } from '../components/UpdatePanel'

// Tokens + tuning live in the DB `settings` table (no .env). Single-user local
// tool; keychain storage (keytar) is a future drop-in, not needed for v1.
export function Settings(): JSX.Element {
  const [form, setForm] = useState<AppSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void api.settings.get().then(setForm)
  }, [])

  const set = (patch: Partial<AppSettings>): void => {
    setSaved(false)
    setForm((f) => (f ? { ...f, ...patch } : f))
  }

  const save = async (): Promise<void> => {
    if (!form) return
    setSaving(true)
    try {
      const next = await api.settings.set({
        github_token: form.github_token,
        vercel_token: form.vercel_token,
        vercel_team_id: form.vercel_team_id,
        idle_cap_seconds: form.idle_cap_seconds,
        sync_interval_minutes: form.sync_interval_minutes
      })
      setForm(next)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  if (!form) return <div className="spin">Loading settings…</div>

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <div className="sub">Stored locally in the app database. Single user, no cloud.</div>
        </div>
      </div>

      <div className="form-narrow">
        <label className="field">
          <span className="lab">GitHub token</span>
          <input
            className="inp"
            type="password"
            value={form.github_token}
            onChange={(e) => set({ github_token: e.target.value })}
            placeholder="read-only fine-grained PAT"
          />
          <span className="hint">Needs read access to the repos you track. Never leaves this machine.</span>
        </label>

        <label className="field">
          <span className="lab">Vercel token</span>
          <input
            className="inp"
            type="password"
            value={form.vercel_token}
            onChange={(e) => set({ vercel_token: e.target.value })}
          />
        </label>

        <label className="field">
          <span className="lab">Vercel team id (optional)</span>
          <input
            className="inp"
            value={form.vercel_team_id}
            onChange={(e) => set({ vercel_team_id: e.target.value })}
            placeholder="team_… — leave blank for a personal account"
          />
        </label>

        <div className="row" style={{ gap: 12 }}>
          <label className="field" style={{ flex: 1 }}>
            <span className="lab">Idle cap (seconds)</span>
            <input
              className="inp"
              type="number"
              min={60}
              value={form.idle_cap_seconds}
              onChange={(e) => set({ idle_cap_seconds: Number(e.target.value) })}
            />
            <span className="hint">Gaps longer than this count as zero when summing session time.</span>
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span className="lab">Sync interval (minutes)</span>
            <input
              className="inp"
              type="number"
              min={1}
              value={form.sync_interval_minutes}
              onChange={(e) => set({ sync_interval_minutes: Number(e.target.value) })}
            />
            <span className="hint">Applied on next launch.</span>
          </label>
        </div>

        <div className="row">
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {saved && <span className="toast">Saved ✓</span>}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '26px 0 18px' }} />
        <UpdatePanel />
      </div>
    </>
  )
}
