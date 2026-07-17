import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { UpdateStatus } from '@shared/types'

// Update status + manual "Check now" + "Restart to update". The packaged app also
// checks automatically on launch and every 6h and downloads in the background;
// this panel just surfaces that and lets the user trigger it or install now.
export function UpdatePanel(): JSX.Element {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    void api.update.status().then(setStatus)
    const unsub = api.update.onEvent(setStatus)
    return unsub
  }, [])

  const check = async (): Promise<void> => {
    setChecking(true)
    try {
      setStatus(await api.update.check())
    } finally {
      setChecking(false)
    }
  }

  const label = (): string => {
    switch (status.state) {
      case 'checking':
        return 'Checking for updates…'
      case 'available':
        return `Update ${status.version ?? ''} found — downloading…`
      case 'downloading':
        return `Downloading update… ${status.percent ?? 0}%`
      case 'downloaded':
        return `Update ${status.version ?? ''} ready to install.`
      case 'not-available':
        return 'You’re on the latest version.'
      case 'error':
        return `Update error: ${status.message ?? 'unknown'}`
      default:
        return status.message ?? 'Up to date.'
    }
  }

  return (
    <div>
      <span className="lab" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
        Updates
      </span>
      <div className="row" style={{ marginTop: 8, gap: 10 }}>
        {status.state === 'downloaded' ? (
          <button className="btn primary" onClick={() => api.update.install()}>
            Restart & install {status.version ?? ''}
          </button>
        ) : (
          <button className="btn" onClick={check} disabled={checking || status.state === 'downloading'}>
            {checking ? 'Checking…' : 'Check for updates'}
          </button>
        )}
        <span className="spin" style={{ color: status.state === 'error' ? 'var(--bad)' : undefined }}>
          {label()}
        </span>
      </div>
      <div className="hint" style={{ marginTop: 6 }}>
        The installed app updates itself automatically; new versions download in the background and
        install on restart.
      </div>
    </div>
  )
}
