import type { Client } from '@libsql/client'
import { getProjects, getAccount, upsertRepoActivity } from '../db/data'
import type { RepoActivity } from '@shared/types'

// Pulls recent commits and PRs for every project that has a repo_full_name AND a
// linked GitHub account, using that account's read-only fine-grained PAT.
// Read-only, one page each — enough for the Overview's open-PR count and the
// detail view's recent activity. Projects with a repo but no linked account are
// skipped (not an error — surfaced as "needs account" in Phase 2).

const API = 'https://api.github.com'
const PER_PAGE = 30

interface GhCommit {
  sha: string
  commit: { message: string; author: { name?: string; date?: string } }
  author: { login?: string } | null
}

interface GhPull {
  number: number
  title: string
  user: { login?: string } | null
  state: string // 'open' | 'closed'
  created_at: string
  updated_at: string
  merged_at: string | null
  html_url: string
}

async function gh<T>(path: string, token: string): Promise<T> {
  const res = await fetch(API + path, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'trackerapp'
    }
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const hint = res.status === 401 ? ' (check the GitHub token in Settings)' : ''
    throw new Error(`GitHub ${res.status} on ${path}${hint}: ${body.slice(0, 160)}`)
  }
  return res.json() as Promise<T>
}

export async function syncGithub(client: Client): Promise<string> {
  const projects = (await getProjects(client)).filter((p) => p.repo_full_name && p.github_account_id)
  if (projects.length === 0) return 'no repos with a linked GitHub account configured'

  let commitCount = 0
  let prCount = 0
  const errors: string[] = []

  for (const p of projects) {
    const repo = p.repo_full_name as string
    try {
      const account = await getAccount(client, p.github_account_id as string)
      if (!account) {
        errors.push(`${repo}: linked GitHub account not found`)
        continue
      }
      const token = account.token

      const [commits, pulls] = await Promise.all([
        gh<GhCommit[]>(`/repos/${repo}/commits?per_page=${PER_PAGE}`, token),
        gh<GhPull[]>(
          `/repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=${PER_PAGE}`,
          token
        )
      ])

      const rows: RepoActivity[] = []

      for (const c of commits) {
        rows.push({
          id: `commit:${c.sha}`,
          project_id: p.id,
          kind: 'commit',
          title: (c.commit.message || '').split('\n')[0].slice(0, 300),
          author: c.author?.login ?? c.commit.author?.name ?? null,
          occurred_at: c.commit.author?.date ?? new Date().toISOString(),
          meta: JSON.stringify({ sha: c.sha })
        })
      }

      for (const pr of pulls) {
        // meta.state drives Overview's open-PR count (json_extract $.state = 'open').
        const state = pr.merged_at ? 'merged' : pr.state
        rows.push({
          id: `pr:${pr.number}`,
          project_id: p.id,
          kind: 'pr',
          title: pr.title.slice(0, 300),
          author: pr.user?.login ?? null,
          occurred_at: pr.updated_at || pr.created_at,
          meta: JSON.stringify({ number: pr.number, state, url: pr.html_url })
        })
      }

      await upsertRepoActivity(client, rows)
      commitCount += commits.length
      prCount += pulls.length
    } catch (err) {
      errors.push(`${repo}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (errors.length && commitCount + prCount === 0) throw new Error(errors.join('; '))
  const base = `${commitCount} commits, ${prCount} PRs across ${projects.length} repo(s)`
  return errors.length ? `${base} (partial: ${errors.join('; ')})` : base
}
