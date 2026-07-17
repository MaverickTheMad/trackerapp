import type { Client } from '@libsql/client'

// Ordered, append-only migrations. Each runs once; applied ids are recorded in
// schema_migrations. To evolve the schema later, append a new entry — never edit
// an existing one. DDL is kept Postgres-portable (see spec's mapping note):
// text id -> uuid, ISO text -> timestamptz, integer 0/1 -> boolean, real -> numeric,
// text json -> jsonb. Same tables, columns, relationships.

interface Migration {
  id: string
  sql: string
}

const MIGRATIONS: Migration[] = [
  {
    id: '0001_initial',
    sql: /* sql */ `
      create table if not exists projects (
        id text primary key,
        name text not null,
        slug text unique not null,
        repo_full_name text,
        vercel_project_id text,
        neon_project_id text,
        claude_cwd text,
        status text not null default 'active',
        created_at text not null,
        updated_at text not null
      );

      create table if not exists tasks (
        id text primary key,
        project_id text references projects(id) on delete cascade,
        title text not null,
        description text,
        stage text not null default 'backlog',
        estimate_hours real,
        adjust_hours real not null default 0,
        sort_order integer not null default 0,
        created_at text not null,
        updated_at text not null,
        completed_at text
      );

      create table if not exists claude_sessions (
        id text primary key,
        project_id text references projects(id) on delete set null,
        claude_cwd text,
        model text,
        started_at text not null,
        ended_at text not null,
        active_seconds integer not null,
        input_tokens integer not null default 0,
        output_tokens integer not null default 0,
        cache_read_tokens integer not null default 0,
        cache_creation_tokens integer not null default 0,
        est_cost_usd real not null default 0,
        ingested_at text not null
      );

      create table if not exists deployments (
        id text primary key,
        project_id text references projects(id) on delete cascade,
        target text,
        state text,
        url text,
        created_at text not null,
        meta text
      );

      create table if not exists repo_activity (
        id text primary key,
        project_id text references projects(id) on delete cascade,
        kind text not null,
        title text,
        author text,
        occurred_at text not null,
        meta text
      );

      create table if not exists costs (
        id text primary key,
        project_id text references projects(id) on delete set null,
        source text not null,
        description text,
        amount_usd real not null,
        period_start text,
        period_end text,
        recurring integer not null default 0,
        created_at text not null
      );

      create table if not exists settings (
        key text primary key,
        value text
      );

      create index if not exists idx_tasks_project on tasks(project_id);
      create index if not exists idx_sessions_project on claude_sessions(project_id);
      create index if not exists idx_sessions_started on claude_sessions(started_at);
      create index if not exists idx_deployments_project on deployments(project_id);
      create index if not exists idx_repo_activity_project on repo_activity(project_id);
      create index if not exists idx_costs_project on costs(project_id);
    `
  }
]

export async function migrate(client: Client): Promise<void> {
  await client.execute(
    `create table if not exists schema_migrations (
       id text primary key,
       applied_at text not null
     )`
  )

  const applied = await client.execute('select id from schema_migrations')
  const done = new Set(applied.rows.map((r) => String(r.id)))

  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue
    // executeMultiple runs the whole DDL batch; libSQL wraps it appropriately.
    await client.executeMultiple(m.sql)
    await client.execute({
      sql: 'insert into schema_migrations (id, applied_at) values (?, ?)',
      args: [m.id, new Date().toISOString()]
    })
  }
}
