import {
  BoardNotFoundError,
  InvalidPriorityError,
  InvalidRankError,
  PrefixTakenError,
  StatusNotFoundError,
  completionAfterMove,
  isPriority,
  isRank,
  normalizeBoardName,
  normalizeCommentBody,
  normalizePrefix,
  normalizeTitle,
  rankBetween,
  type Board,
  type Priority,
  type StatusCategory,
  type Task,
  type TaskComment,
  type TaskKey,
  type TaskPatch,
  type TaskStatus,
  type TaskStore,
} from '@dailly/tasks-core'
import type { Database } from 'better-sqlite3'
import { deleteEntryRow, insertEntryRow, updateEntryRow } from '../entries/index.js'

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
  readonly board_id: string
  readonly key: number
  readonly key_prefix: string
  readonly title: string
  readonly status_id: string
  readonly priority: Priority
  readonly rank: string
  readonly completed_at: string | null
  readonly created_at: string
  readonly body: string
}

const toTask = (row: TaskRow): Task => ({
  id: row.id,
  boardId: row.board_id,
  key: row.key,
  keyPrefix: row.key_prefix,
  title: row.title,
  statusId: row.status_id,
  priority: row.priority,
  rank: row.rank,
  completedAt: row.completed_at,
  createdAt: row.created_at,
  body: row.body,
})

const SELECT_TASKS = `
  SELECT t.entry_id AS id, t.board_id, t.key, t.key_prefix, t.title, t.status_id, t.priority, t.rank,
         t.completed_at, e.created_at, e.body
    FROM tasks t
    JOIN entries e ON e.id = t.entry_id
    JOIN task_statuses s ON s.id = t.status_id`

const SELECT_BOARD = 'SELECT id, name, prefix FROM task_boards'

interface CommentRow {
  readonly id: string
  readonly body: string
  readonly created_at: string
}

const toComment = (row: CommentRow): TaskComment => ({ id: row.id, body: row.body, createdAt: row.created_at })

export function sqliteTaskStore({ db, newId, now }: SqliteTaskStoreDeps): TaskStore {
  /** The Entry id of a task, which is also its id; `undefined` when no task has that key. */
  const entryOf = ({ prefix, key }: TaskKey): string | undefined =>
    (db.prepare('SELECT entry_id FROM tasks WHERE key_prefix = ? AND key = ?').get(prefix, key) as
      | { entry_id: string }
      | undefined)?.entry_id

  const statuses = (): TaskStatus[] =>
    db.prepare('SELECT id, name, category, position FROM task_statuses ORDER BY position').all() as StatusRow[]
  const findBoard = (id: string) => db.prepare(`${SELECT_BOARD} WHERE id = ?`).get(id) as Board | undefined

  /** RN9 reads every prefix a board ever used, not only the current ones. */
  const claim = (prefix: string, boardId: string | null): void => {
    const owner = db.prepare('SELECT board_id FROM task_board_prefixes WHERE prefix = ?').get(prefix) as
      | { board_id: string }
      | undefined
    if (owner && owner.board_id !== boardId) throw new PrefixTakenError(prefix)
  }
  const reserve = (prefix: string, boardId: string): void => {
    db.prepare('INSERT OR IGNORE INTO task_board_prefixes (prefix, board_id) VALUES (?, ?)').run(prefix, boardId)
  }

  const createBoard = db.transaction((name: string, prefix: string): Board => {
    claim(prefix, null)
    const board: Board = { id: newId(), name, prefix }
    db.prepare('INSERT INTO task_boards (id, name, prefix, counter, created_at) VALUES (?, ?, ?, 0, ?)').run(
      board.id,
      name,
      prefix,
      now(),
    )
    reserve(prefix, board.id)
    return board
  })

  const updateBoard = db.transaction((id: string, name: string | undefined, prefix: string | undefined) => {
    const current = findBoard(id)
    if (!current) return null
    const next: Board = { ...current, name: name ?? current.name, prefix: prefix ?? current.prefix }
    claim(next.prefix, id)
    db.prepare('UPDATE task_boards SET name = ?, prefix = ? WHERE id = ?').run(next.name, next.prefix, id)
    reserve(next.prefix, id)
    return next
  })

  const create = db.transaction((boardId: string, title: string, statusId: string): Task => {
    if (!findBoard(boardId)) throw new BoardNotFoundError(boardId)
    if (!db.prepare('SELECT 1 FROM task_statuses WHERE id = ?').get(statusId)) {
      throw new StatusNotFoundError(statusId)
    }
    const top = db
      .prepare('SELECT rank FROM tasks WHERE board_id = ? AND status_id = ? ORDER BY rank LIMIT 1')
      .get(boardId, statusId) as { rank: string } | undefined
    // The number and the prefix come from the same row, in the same write.
    const { counter: key, prefix } = db
      .prepare('UPDATE task_boards SET counter = counter + 1 WHERE id = ? RETURNING counter, prefix')
      .get(boardId) as { counter: number; prefix: string }

    const at = now()
    const task: Task = {
      id: newId(),
      boardId,
      key,
      keyPrefix: prefix,
      title,
      statusId,
      priority: 0,
      rank: rankBetween(undefined, top?.rank),
      completedAt: null,
      createdAt: at,
      body: '',
    }
    // The body of the Entry is the task's description, empty at capture.
    insertEntryRow(db, { id: task.id, kind: 'task', body: '', occurredAt: at, createdAt: at, updatedAt: at })
    db.prepare(
      `INSERT INTO tasks (entry_id, board_id, key, key_prefix, title, status_id, priority, rank, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    ).run(task.id, boardId, key, prefix, task.title, task.statusId, task.priority, task.rank)
    return task
  })

  const update = db.transaction(({ prefix, key }: TaskKey, patch: TaskPatch): Task | null => {
    const current = db.prepare(`${SELECT_TASKS} WHERE t.key_prefix = ? AND t.key = ?`).get(prefix, key) as
      | TaskRow
      | undefined
    if (!current) return null
    // Every field is checked before the first write, so a refusal changes nothing.
    const title = patch.title === undefined ? current.title : normalizeTitle(patch.title)
    if (patch.priority !== undefined && !isPriority(patch.priority)) {
      throw new InvalidPriorityError(patch.priority)
    }
    let placed = { status_id: current.status_id, rank: current.rank, completed_at: current.completed_at }
    if (patch.placement) {
      const { statusId, rank } = patch.placement
      const status = db.prepare('SELECT category FROM task_statuses WHERE id = ?').get(statusId) as
        | { category: StatusCategory }
        | undefined
      if (!status) throw new StatusNotFoundError(statusId)
      if (!isRank(rank)) throw new InvalidRankError(rank)
      placed = {
        status_id: statusId,
        rank,
        completed_at: completionAfterMove(current.completed_at, status.category, now()),
      }
    }
    const priority = patch.priority ?? current.priority

    db.prepare(
      'UPDATE tasks SET title = ?, priority = ?, status_id = ?, rank = ?, completed_at = ? WHERE entry_id = ?',
    ).run(title, priority, placed.status_id, placed.rank, placed.completed_at, current.id)
    updateEntryRow(db, current.id, patch.body === undefined ? {} : { body: patch.body }, now())
    return toTask({ ...current, ...placed, title, priority, body: patch.body ?? current.body })
  })

  return {
    async boards() {
      // By insertion: the seed first, then each board as it was created.
      return db.prepare(`${SELECT_BOARD} ORDER BY rowid`).all() as Board[]
    },

    async createBoard(input) {
      // Validated before the transaction, the order the screen shows them in.
      return createBoard(normalizeBoardName(input.name), normalizePrefix(input.prefix))
    },

    async updateBoard(id, patch) {
      const name = patch.name === undefined ? undefined : normalizeBoardName(patch.name)
      const prefix = patch.prefix === undefined ? undefined : normalizePrefix(patch.prefix)
      return updateBoard(id, name, prefix)
    },

    async board(boardId) {
      if (!findBoard(boardId)) return null
      const rows = db.prepare(`${SELECT_TASKS} WHERE t.board_id = ? ORDER BY s.position, t.rank`).all(boardId) as TaskRow[]
      return { statuses: statuses(), tasks: rows.map(toTask) }
    },

    async create({ boardId, title, statusId }) {
      // Validated before the transaction, so a refusal costs no key.
      return create(boardId, normalizeTitle(title), statusId)
    },

    async update(key, patch) {
      return update(key, patch)
    },

    async delete({ prefix, key }) {
      const found = db.prepare('SELECT entry_id FROM tasks WHERE key_prefix = ? AND key = ?').get(prefix, key) as
        | { entry_id: string }
        | undefined
      if (!found) return false
      // The facet and its comments go with the Entry (ON DELETE CASCADE).
      deleteEntryRow(db, found.entry_id)
      return true
    },

    async comments(key) {
      const entry = entryOf(key)
      if (entry === undefined) return null
      const rows = db
        .prepare('SELECT id, body, created_at FROM task_comments WHERE entry_id = ? ORDER BY created_at, id')
        .all(entry) as CommentRow[]
      return rows.map(toComment)
    },

    async addComment(key, body) {
      const normalized = normalizeCommentBody(body)
      const entry = entryOf(key)
      if (entry === undefined) return null
      const comment: TaskComment = { id: newId(), body: normalized, createdAt: now() }
      db.prepare('INSERT INTO task_comments (id, entry_id, body, created_at) VALUES (?, ?, ?, ?)').run(
        comment.id,
        entry,
        comment.body,
        comment.createdAt,
      )
      return comment
    },

    async deleteComment(key, id) {
      const entry = entryOf(key)
      if (entry === undefined) return 'task-not-found'
      const { changes } = db.prepare('DELETE FROM task_comments WHERE id = ? AND entry_id = ?').run(id, entry)
      return changes > 0 ? 'deleted' : 'comment-not-found'
    },
  }
}
