import {
  InvalidColorError,
  InvalidMoveToError,
  LastStatusError,
  STATUS_SEED,
  StatusHasTasksError,
  StatusNameTakenError,
  isStatusColor,
  normalizeStatusName,
  orderStatuses,
  parseNewStatus,
  ranksOnTop,
  sameStatusName,
  type StoredStatus,
  BoardNotFoundError,
  SEARCH_LIMIT,
  searchKey,
  type TaskSearchResult,
  InvalidLabelError,
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
import { deleteEntryRow, insertEntryRow, labelsExist, setEntryLabels, updateEntryRow } from '../entries/index.js'

export interface SqliteTaskStoreDeps {
  readonly db: Database
  readonly newId: () => string
  /** An ISO instant in UTC, the shape every timestamp in `entries` has. */
  readonly now: () => string
}

interface StatusRow {
  readonly id: string
  readonly board_id: string
  readonly name: string
  readonly category: StatusCategory
  readonly color: StoredStatus['color']
  readonly created_order: number
}

const toStored = (row: StatusRow): StoredStatus => ({
  id: row.id,
  boardId: row.board_id,
  name: row.name,
  category: row.category,
  color: row.color,
  createdOrder: row.created_order,
})

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
  /** `group_concat` of the Entry's labels, or `null` with none. */
  readonly label_ids: string | null
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
  // Sorted, so the order a set comes back in does not depend on the index.
  labelIds: row.label_ids === null ? [] : row.label_ids.split(',').sort(),
})

const SELECT_TASKS = `
  SELECT t.entry_id AS id, t.board_id, t.key, t.key_prefix, t.title, t.status_id, t.priority, t.rank,
         t.completed_at, e.created_at, e.body,
         (SELECT group_concat(label_id) FROM entry_labels WHERE entry_id = t.entry_id) AS label_ids
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

  const SELECT_STATUS = 'SELECT id, board_id, name, category, color, created_order FROM task_statuses'
  const statusesOf = (boardId: string): TaskStatus[] =>
    orderStatuses((db.prepare(`${SELECT_STATUS} WHERE board_id = ?`).all(boardId) as StatusRow[]).map(toStored))
  /** A status of that board, or nothing: a status of another board is not found (#43). */
  const statusIn = (boardId: string, statusId: string): StatusRow | undefined =>
    db.prepare(`${SELECT_STATUS} WHERE id = ? AND board_id = ?`).get(statusId, boardId) as StatusRow | undefined
  const nextOrder = (): number =>
    (db.prepare('SELECT COALESCE(MAX(created_order), 0) + 1 AS next FROM task_statuses').get() as { next: number }).next
  const insertStatus = (id: string, boardId: string, status: { name: string; category: string; color: string }) =>
    db
      .prepare('INSERT INTO task_statuses (id, board_id, name, category, color, created_order) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, boardId, status.name, status.category, status.color, nextOrder())
  const claimName = (boardId: string, name: string, except: string | null): void => {
    const names = db.prepare('SELECT id, name FROM task_statuses WHERE board_id = ?').all(boardId) as {
      id: string
      name: string
    }[]
    if (names.some((row) => row.id !== except && sameStatusName(row.name, name))) throw new StatusNameTakenError(name)
  }
  /** The tasks of a board in the order of its columns (RN11), then by rank. */
  const ordered = (boardId: string, rows: readonly TaskRow[]): TaskRow[] => {
    const position = new Map(statusesOf(boardId).map((status) => [status.id, status.position]))
    return [...rows].sort(
      (a, b) =>
        (position.get(a.status_id) ?? 0) - (position.get(b.status_id) ?? 0) ||
        (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0),
    )
  }
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
    // Every board is born with the five of the seed, ids of its own (RN11).
    for (const seed of STATUS_SEED) insertStatus(newId(), board.id, seed)
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

  const create = db.transaction((boardId: string, title: string, statusId: string, priority: Priority): Task => {
    if (!findBoard(boardId)) throw new BoardNotFoundError(boardId)
    if (!statusIn(boardId, statusId)) throw new StatusNotFoundError(statusId)
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
      priority,
      rank: rankBetween(undefined, top?.rank),
      completedAt: null,
      createdAt: at,
      body: '',
      labelIds: [],
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
    if (patch.labelIds && !labelsExist(db, patch.labelIds)) throw new InvalidLabelError()
    let placed = { status_id: current.status_id, rank: current.rank, completed_at: current.completed_at }
    if (patch.placement) {
      const { statusId, rank } = patch.placement
      const status = statusIn(current.board_id, statusId)
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
    if (patch.labelIds) setEntryLabels(db, current.id, patch.labelIds)
    return toTask({
      ...current,
      ...placed,
      title,
      priority,
      body: patch.body ?? current.body,
      label_ids: patch.labelIds ? [...new Set(patch.labelIds)].join(',') || null : current.label_ids,
    })
  })

  const addStatus = db.transaction((boardId: string, input: Parameters<TaskStore['addStatus']>[1]) => {
    if (!findBoard(boardId)) return null
    const parsed = parseNewStatus(input)
    claimName(boardId, parsed.name, null)
    const id = newId()
    insertStatus(id, boardId, parsed)
    return statusesOf(boardId).find((status) => status.id === id) ?? null
  })

  const updateStatus = db.transaction((id: string, patch: Parameters<TaskStore['updateStatus']>[1]) => {
    const current = db.prepare(`${SELECT_STATUS} WHERE id = ?`).get(id) as StatusRow | undefined
    if (!current) return null
    const name = patch.name === undefined ? current.name : normalizeStatusName(patch.name)
    if (patch.color !== undefined && !isStatusColor(patch.color)) throw new InvalidColorError(patch.color)
    claimName(current.board_id, name, id)
    db.prepare('UPDATE task_statuses SET name = ?, color = ? WHERE id = ?').run(name, patch.color ?? current.color, id)
    return statusesOf(current.board_id).find((status) => status.id === id) ?? null
  })

  const deleteStatus = db.transaction((id: string, moveTo: string | undefined): boolean => {
    const current = db.prepare(`${SELECT_STATUS} WHERE id = ?`).get(id) as StatusRow | undefined
    if (!current) return false
    if (statusesOf(current.board_id).length === 1) throw new LastStatusError()
    const moving = db.prepare('SELECT entry_id, completed_at FROM tasks WHERE status_id = ? ORDER BY rank').all(id) as {
      entry_id: string
      completed_at: string | null
    }[]
    if (moving.length > 0 && moveTo === undefined) throw new StatusHasTasksError()
    if (moveTo !== undefined) {
      const target = statusIn(current.board_id, moveTo)
      if (!target || target.id === id) throw new InvalidMoveToError('o destino deve ser outro status do mesmo board')
      // In one write with the delete (RN12): on top of the destination, in their order, through RN3.
      const top = db.prepare('SELECT rank FROM tasks WHERE status_id = ? ORDER BY rank LIMIT 1').get(target.id) as
        | { rank: string }
        | undefined
      const ranks = ranksOnTop(moving.length, top?.rank)
      const at = now()
      const move = db.prepare('UPDATE tasks SET status_id = ?, rank = ?, completed_at = ? WHERE entry_id = ?')
      moving.forEach((task, index) => {
        move.run(target.id, ranks[index], completionAfterMove(task.completed_at, target.category, at), task.entry_id)
        updateEntryRow(db, task.entry_id, {}, at)
      })
    }
    db.prepare('DELETE FROM task_statuses WHERE id = ?').run(id)
    return true
  })

  /** `%`, `_` and the escape itself are letters in the search, not wildcards. */
  const likeLiteral = (text: string) => `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`

  return {
    async search(text) {
      const trimmed = text.trim()
      if (trimmed === '') return []
      const named = searchKey(trimmed)
      // SQLite's LIKE folds A–Z only, the rule the fake follows (`matchesTitle`).
      const rows = db
        .prepare(
          `SELECT t.key, t.key_prefix AS keyPrefix, t.title, t.board_id AS boardId, b.name AS boardName,
                  (t.key_prefix = ? AND t.key = ?) AS exact
             FROM tasks t
             JOIN entries e ON e.id = t.entry_id
             JOIN task_boards b ON b.id = t.board_id
            WHERE (t.key_prefix = ? AND t.key = ?) OR t.title LIKE ? ESCAPE '\\'
            ORDER BY exact DESC, e.created_at DESC, t.rowid DESC
            LIMIT ?`,
        )
        .all(
          named?.prefix ?? null,
          named?.key ?? null,
          named?.prefix ?? null,
          named?.key ?? null,
          likeLiteral(trimmed),
          SEARCH_LIMIT,
        ) as (TaskSearchResult & { exact: number | null })[]
      return rows.map(({ exact: _exact, ...result }) => result)
    },

    async addStatus(boardId, input) {
      return addStatus(boardId, input)
    },

    async updateStatus(id, patch) {
      return updateStatus(id, patch)
    },

    async deleteStatus(id, moveTo) {
      return deleteStatus(id, moveTo)
    },

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
      const rows = db.prepare(`${SELECT_TASKS} WHERE t.board_id = ?`).all(boardId) as TaskRow[]
      return { statuses: statusesOf(boardId), tasks: ordered(boardId, rows).map(toTask) }
    },

    async create({ boardId, title, statusId, priority = 0 }) {
      // Validated before the transaction, so a refusal costs no key.
      const normalized = normalizeTitle(title)
      if (!isPriority(priority)) throw new InvalidPriorityError(priority)
      return create(boardId, normalized, statusId, priority)
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
      // The task first, as the fake does: a body for a task that is gone is moot.
      const entry = entryOf(key)
      if (entry === undefined) return null
      const normalized = normalizeCommentBody(body)
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
