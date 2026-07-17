import type { Client } from '@libsql/client'
import { getProjects, getSetting, upsertDeployments } from '../db/data'
import type { Deployment } from '@shared/types'

// Lists recent deployments for every project with a vercel_project_id. Read-only.
// Vercel billing/usage costs are a separate pull in Phase 5.

const API = 'https://api.vercel.com'
const LIMIT = 20

interface VercelDeployment {
  uid: string
  url?: string
  created: number // ms epoch
  state?: string
  readyState?: string
  target?: string | null
  meta?: Record<string, unknown>
}

async function vercel<T>(path: string, token: string): Promise<T> {
  const res = await fetch(API + path, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const hint = res.status === 401 || res.status === 403 ? ' (check the Vercel token in Settings)' : ''
    throw new Error(`Vercel ${res.status} on ${path}${hint}: ${body.slice(0, 160)}`)
  }
  return res.json() as Promise<T>
}

export async function syncVercel(client: Client): Promise<string> {
  const projects = (await getProjects(client)).filter((p) => p.vercel_project_id)
  if (projects.length === 0) return 'no Vercel projects configured'

  const token = (await getSetting(client, 'vercel_token')) ?? ''
  if (!token) throw new Error('Vercel token not set — add it in Settings')
  const teamId = (await getSetting(client, 'vercel_team_id')) ?? ''
  const teamParam = teamId ? `&teamId=${encodeURIComponent(teamId)}` : ''

  let count = 0
  const errors: string[] = []

  for (const p of projects) {
    const pid = p.vercel_project_id as string
    try {
      const data = await vercel<{ deployments: VercelDeployment[] }>(
        `/v6/deployments?projectId=${encodeURIComponent(pid)}&limit=${LIMIT}${teamParam}`,
        token
      )
      const rows: Deployment[] = (data.deployments ?? []).map((d) => ({
        id: d.uid,
        project_id: p.id,
        target: d.target ?? null,
        state: d.state ?? d.readyState ?? null,
        url: d.url ? (d.url.startsWith('http') ? d.url : `https://${d.url}`) : null,
        created_at: new Date(d.created).toISOString(),
        meta: d.meta ? JSON.stringify(d.meta) : null
      }))
      await upsertDeployments(client, rows)
      count += rows.length
    } catch (err) {
      errors.push(`${pid}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (errors.length && count === 0) throw new Error(errors.join('; '))
  const base = `${count} deployments across ${projects.length} project(s)`
  return errors.length ? `${base} (partial: ${errors.join('; ')})` : base
}
