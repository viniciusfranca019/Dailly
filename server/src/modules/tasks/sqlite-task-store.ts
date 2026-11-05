import {
  StatusNotFoundError,
  normalizeTitle,
  rankBetween,
  type Priority,
  type StatusCategory,
  type Task,
  type TaskStatus,
  type TaskStore,
} from '@dailly/tasks-core'
import type { Database } from 'better-sqlite3'
import { deleteEntryRow, insertEntryRow } from '../entries/index.js'

export interface SqliteTaskStoreDeps {
  readonly db: Database
  readonly newId: () => string
  /** An ISO instant in UTC, the shape every timestamp in `entries` has. */
  readonly now: () => string
}

interface StatusRow {
  readonly id: string
  readonly name: string
  readonly category: StatusCategory
  readonly position: number
}

interface TaskRow {
  readonly id: string
  readonly key: number
  readonly title: string
  readonly status_id: string
  readonly priority: Priority
  readonly rank: string
  readonly completed_at: string | null
  readonly created_at: string
}

const toTask = (row: TaskRow): Task => ({
  id: row.id,
  key: row.key,
  title: row.title,
  statusId: row.status_id,
  priority: row.priority,
  rank: row.rank,
  completedAt: row.completed_at,
  createdAt: row.created_at,
})

const SELECT_TASKS = `
  SELECT t.entry_id AS id, t.key, t.title, t.status_id, t.priority, t.rank,
         t.completed_at, e.created_at
    FROM tasks t
    JOIN entries e ON e.id = t.entry_id
    JOIN task_statuses s ON s.id = t.status_id`

export function sqliteTaskStore({ db, newId, now }: SqliteTaskStoreDeps): TaskStore {
  const statuses = (): TaskStatus[] =>
    db.prepare('SELECT id, name, category, position FROM task_statuses ORDER BY position').all() as StatusRow[]

  const create = db.transaction((title: string, statusId: string): Task => {
    if (!db.prepare('SELECT 1 FROM task_statuses WHERE id = ?').get(statusId)) {
      throw new StatusNotFoundError(statusId)
    }
    const top = db
      .prepare('SELECT rank FROM tasks WHERE status_id = ? ORDER BY rank LIMIT 1')
      .get(statusId) as { rank: string } | undefined
    const { last_key: key } = db
      .prepare('UPDATE task_counter SET last_key = last_key + 1 WHERE id = 1 RETURNING last_key')
      .get() as { last_key: number }

    const at = now()
    const task: Task = {
      id: newId(),
      key,
      title,
      statusId,
      priority: 0,
      rank: rankBetween(undefined, top?.rank),
      completedAt: null,
      createdAt: at,
    }
    // The body of the Entry is the task's description, empty at capture.
    insertEntryRow(db, { id: task.id, kind: 'task', body: '', occurredAt: at, createdAt: at, updatedAt: at })
    db.prepare(
      `INSERT INTO tasks (entry_id, key, title, status_id, priority, rank, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    ).run(task.id, task.key, task.title, task.statusId, task.priority, task.rank)
    return task
  })

  return {
    async board() {
      const rows = db.prepare(`${SELECT_TASKS} ORDER BY s.position, t.rank`).all() as TaskRow[]
      return { statuses: statuses(), tasks: rows.map(toTask) }
    },

    async create({ title, statusId }) {
      // Validated before the transaction, so a refusal costs no key.
      return create(normalizeTitle(title), statusId)
    },

    async delete(key) {
      const found = db.prepare('SELECT entry_id FROM tasks WHERE key = ?').get(key) as
        | { entry_id: string }
        | undefined
      if (!found) return false
      // The facet goes with the Entry (ON DELETE CASCADE).
      deleteEntryRow(db, found.entry_id)
      return true
    },
  }
}
