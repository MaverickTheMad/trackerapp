import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import type { Task, TaskStage } from '@shared/types'
import { TaskFormModal } from './TaskFormModal'

const STAGES: { key: TaskStage; label: string }[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'shipped', label: 'Shipped' }
]

// Recompute contiguous sort_order per stage after a move, and return only the
// tasks whose stage or sort_order actually changed (the reorder payload).
function reflow(
  tasks: Task[],
  dragId: string,
  targetStage: TaskStage,
  beforeId: string | null
): { next: Task[]; changed: { id: string; sort_order: number; stage: TaskStage }[] } {
  const dragged = tasks.find((t) => t.id === dragId)
  if (!dragged) return { next: tasks, changed: [] }

  // Ordered ids per stage, with the dragged task removed everywhere.
  const columns = new Map<TaskStage, Task[]>()
  for (const s of STAGES) columns.set(s.key, [])
  for (const t of tasks) {
    if (t.id === dragId) continue
    columns.get(t.stage)?.push(t)
  }

  const target = columns.get(targetStage)!
  const insertAt = beforeId ? target.findIndex((t) => t.id === beforeId) : target.length
  target.splice(insertAt < 0 ? target.length : insertAt, 0, dragged)

  const next: Task[] = []
  const changed: { id: string; sort_order: number; stage: TaskStage }[] = []
  for (const s of STAGES) {
    const list = columns.get(s.key)!
    list.forEach((t, i) => {
      const updated = { ...t, stage: s.key, sort_order: i }
      next.push(updated)
      if (t.stage !== s.key || t.sort_order !== i) {
        changed.push({ id: t.id, sort_order: i, stage: s.key })
      }
    })
  }
  return { next, changed }
}

export function TaskBoard({
  projectId,
  onChange
}: {
  projectId: string
  onChange?: () => void
}): JSX.Element {
  const [tasks, setTasks] = useState<Task[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<TaskStage | null>(null)
  const [editing, setEditing] = useState<Task | null>(null)
  const [adding, setAdding] = useState<TaskStage | null>(null)
  const [newTitle, setNewTitle] = useState('')

  const load = async (): Promise<void> => setTasks(await api.tasks.list(projectId))
  useEffect(() => {
    void load()
  }, [projectId])

  const byStage = useMemo(() => {
    const m = new Map<TaskStage, Task[]>()
    for (const s of STAGES) m.set(s.key, [])
    for (const t of [...tasks].sort((a, b) => a.sort_order - b.sort_order))
      m.get(t.stage)?.push(t)
    return m
  }, [tasks])

  const drop = async (targetStage: TaskStage, beforeId: string | null): Promise<void> => {
    setOverStage(null)
    if (!dragId) return
    const { next, changed } = reflow(tasks, dragId, targetStage, beforeId)
    setDragId(null)
    if (changed.length === 0) return
    setTasks(next) // optimistic
    await api.tasks.reorder(changed)
    onChange?.() // stage → shipped can change completed_at; adjust_hours unaffected here
  }

  const quickAdd = async (stage: TaskStage): Promise<void> => {
    const title = newTitle.trim()
    if (!title) {
      setAdding(null)
      return
    }
    const count = byStage.get(stage)?.length ?? 0
    await api.tasks.upsert({ project_id: projectId, title, stage, sort_order: count })
    setNewTitle('')
    setAdding(null)
    await load()
  }

  const saveEdit = async (input: Parameters<typeof api.tasks.upsert>[0]): Promise<void> => {
    await api.tasks.upsert(input)
    setEditing(null)
    await load()
    onChange?.()
  }

  const removeTask = async (id: string): Promise<void> => {
    await api.tasks.remove(id)
    setEditing(null)
    await load()
    onChange?.()
  }

  return (
    <>
      <div className="board">
        {STAGES.map((s) => {
          const list = byStage.get(s.key) ?? []
          return (
            <div
              key={s.key}
              className={`column ${overStage === s.key ? 'over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setOverStage(s.key)
              }}
              onDragLeave={(e) => {
                // only clear when leaving the column, not moving between its cards
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage(null)
              }}
              onDrop={() => drop(s.key, null)}
            >
              <div className="column-head">
                <span>{s.label}</span>
                <span className="count">{list.length}</span>
              </div>

              <div className="column-body">
                {list.map((t) => (
                  <div
                    key={t.id}
                    className={`task-card ${dragId === t.id ? 'dragging' : ''}`}
                    draggable
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => {
                      setDragId(null)
                      setOverStage(null)
                    }}
                    onDrop={(e) => {
                      e.stopPropagation()
                      void drop(s.key, t.id)
                    }}
                    onClick={() => setEditing(t)}
                  >
                    <div className="task-title">{t.title}</div>
                    {(t.estimate_hours != null || t.adjust_hours !== 0) && (
                      <div className="task-meta">
                        {t.estimate_hours != null && <span>est {t.estimate_hours}h</span>}
                        {t.adjust_hours !== 0 && (
                          <span className="adjust">
                            {t.adjust_hours > 0 ? '+' : ''}
                            {t.adjust_hours}h
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {adding === s.key ? (
                  <input
                    className="inp"
                    autoFocus
                    placeholder="Task title…"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onBlur={() => void quickAdd(s.key)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void quickAdd(s.key)
                      if (e.key === 'Escape') {
                        setNewTitle('')
                        setAdding(null)
                      }
                    }}
                  />
                ) : (
                  <button
                    className="add-card"
                    onClick={() => {
                      setNewTitle('')
                      setAdding(s.key)
                    }}
                  >
                    + Add
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {editing && (
        <TaskFormModal
          projectId={projectId}
          initial={editing}
          onSubmit={saveEdit}
          onCancel={() => setEditing(null)}
          onDelete={() => removeTask(editing.id)}
        />
      )}
    </>
  )
}
