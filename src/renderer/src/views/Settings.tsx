import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Account, AccountInput, AccountProvider, AppSettings } from '@shared/types'
import { UpdatePanel } from '../components/UpdatePanel'

// Tokens + tuning live in the DB `settings`/`accounts` tables (no .env). Single-user
// local tool; keychain storage (keytar) is a future drop-in, not needed for v1.
export function Settings(): JSX.Element {
  const [form, setForm] = useState<AppSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountForm, setAccountForm] = useState<AccountInput>({
    provider: 'github',
    label: '',
    token: '',
    team_id: ''
  })
  const [savingAccount, setSavingAccount] = useState(false)
  // When set, the account form is editing an existing row (upsert by id) rather
  // than creating a new one. Provider stays fixed while editing.
  const editingAccount = accountForm.id != null

  useEffect(() => {
    void api.settings.get().then(setForm)
    void loadAccounts()
  }, [])

  const loadAccounts = async (): Promise<void> => {
    setAccounts(await api.accounts.list())
  }

  const set = (patch: Partial<AppSettings>): void => {
    setSaved(false)
    setForm((f) => (f ? { ...f, ...patch } : f))
  }

  const save = async (): Promise<void> => {
    if (!form) return
    setSaving(true)
    try {
      const next = await api.settings.set({
        idle_cap_seconds: form.idle_cap_seconds,
        sync_interval_minutes: form.sync_interval_minutes
      })
      setForm(next)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  const setAccountField = (patch: Partial<AccountInput>): void =>
    setAccountForm((f) => ({ ...f, ...patch }))

  const resetAccountForm = (): void =>
    setAccountForm({ provider: 'github', label: '', token: '', team_id: '' })

  // Load an existing account into the shared form for in-place edit. Token is
  // prefilled so a save without touching it preserves the current value.
  const editAccount = (a: Account): void =>
    setAccountForm({
      id: a.id,
      provider: a.provider,
      label: a.label,
      token: a.token,
      team_id: a.team_id ?? ''
    })

  const submitAccount = async (): Promise<void> => {
    if (!accountForm.label.trim() || !accountForm.token.trim()) return
    setSavingAccount(true)
    try {
      // id present → upsertAccount updates in place; absent → creates a new row.
      await api.accounts.upsert({
        id: accountForm.id,
        provider: accountForm.provider,
        label: accountForm.label.trim(),
        token: accountForm.token.trim(),
        team_id: accountForm.team_id || null
      })
      resetAccountForm()
      await loadAccounts()
    } finally {
      setSavingAccount(false)
    }
  }

  const removeAccount = async (id: string): Promise<void> => {
    await api.accounts.remove(id)
    // If the removed account was loaded for edit, drop back to a blank add form.
    if (accountForm.id === id) resetAccountForm()
    await loadAccounts()
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
        <h2 style={{ marginBottom: 4 }}>Accounts</h2>
        <div className="sub" style={{ marginBottom: 12 }}>
          GitHub and Vercel credentials. Add one or more per provider, then link each project to
          the account it should sync with.
        </div>

        {accounts.length > 0 && (
          <div className="list" style={{ marginBottom: 16 }}>
            {accounts.map((a) => (
              <div key={a.id} className="row" style={{ gap: 12, alignItems: 'center' }}>
                <span className="badge">{a.provider}</span>
                <span style={{ flex: 1 }}>{a.label}</span>
                {a.team_id && <span className="hint">team: {a.team_id}</span>}
                <button className="btn ghost" onClick={() => editAccount(a)}>
                  Edit
                </button>
                <button className="btn ghost" onClick={() => removeAccount(a.id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="row" style={{ gap: 12 }}>
          <label className="field" style={{ width: 120 }}>
            <span className="lab">Provider</span>
            <select
              className="inp"
              value={accountForm.provider}
              disabled={editingAccount}
              onChange={(e) => setAccountField({ provider: e.target.value as AccountProvider })}
            >
              <option value="github">github</option>
              <option value="vercel">vercel</option>
            </select>
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span className="lab">Label</span>
            <input
              className="inp"
              value={accountForm.label}
              onChange={(e) => setAccountField({ label: e.target.value })}
              placeholder="personal, team-inferno, …"
            />
          </label>
        </div>

        <label className="field">
          <span className="lab">Token</span>
          <input
            className="inp"
            type="password"
            value={accountForm.token}
            onChange={(e) => setAccountField({ token: e.target.value })}
            placeholder="read-only fine-grained PAT"
          />
          <span className="hint">Needs read access to the repos/projects you track. Never leaves this machine.</span>
        </label>

        {accountForm.provider === 'vercel' && (
          <label className="field">
            <span className="lab">Team id (optional)</span>
            <input
              className="inp"
              value={accountForm.team_id ?? ''}
              onChange={(e) => setAccountField({ team_id: e.target.value })}
              placeholder="team_… — leave blank for a personal account"
            />
          </label>
        )}

        <div className="row">
          <button
            className="btn primary"
            onClick={submitAccount}
            disabled={savingAccount || !accountForm.label.trim() || !accountForm.token.trim()}
          >
            {savingAccount ? 'Saving…' : editingAccount ? 'Save account' : 'Add account'}
          </button>
          {editingAccount && (
            <button className="btn ghost" onClick={resetAccountForm} disabled={savingAccount}>
              Cancel
            </button>
          )}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '26px 0 18px' }} />

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
