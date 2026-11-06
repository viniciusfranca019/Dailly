import {
  BoardNotFoundError,
  PrefixTakenError,
  SEED_BOARD,
  normalizeBoardName,
  normalizePrefix,
  type Board,
} from './board.js'
import { normalizeCommentBody, type TaskComment } from './comment.js'
import { completionAfterMove } from './move.js'
import { rankBetween } from './rank.js'
import {
  DEFAULT_STATUSES,
  InvalidPriorityError,
  InvalidRankError,
  StatusNotFoundError,
  isPriority,
  isRank,
  normalizeTitle,
  type Task,
  type TaskKey,
  type TaskStatus,
} from './task.js'
import type { TaskStore } from './task-store.js'

export interface InMemoryTaskStoreDeps {
  readonly newId: () => string
  readonly now: () => string
}

/** Statuses by position, then each task by its rank inside the status. */
export function orderTasks(statuses: readonly TaskStatus[], tasks: readonly Task[]): Task[] {
  const position = new Map(statuses.map((status) => [status.id, status.position]))
  return [...tasks].sort(
    (a, b) =>
      (position.get(a.statusId) ?? 0) - (position.get(b.statusId) ?? 0) ||
      (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0),
  )
}

/** The fake, held to the same contract as the SQLite store. */
export function inMemoryTaskStore({ newId, now }: InMemoryTaskStoreDeps): TaskStore {
  const boards: Board[] = [SEED_BOARD]
  /** The last number each board handed out (RN5). */
  const counters = new Map<string, number>([[SEED_BOARD.id, 0]])
  /** Every prefix a board ever used, and whose it is (RN9). */
  const prefixes = new Map<string, string>([[SEED_BOARD.prefix, SEED_BOARD.id]])
  const tasks: Task[] = []
  /** By the task's id (the Entry's), gone with it, as `ON DELETE CASCADE`. */
  const comments = new Map<string, TaskComment[]>()

  const same = (task: Task, { prefix, key }: TaskKey) => task.keyPrefix === prefix && task.key === key
  const claim = (prefix: string, boardId: string | null) => {
    const owner = prefixes.get(prefix)
    if (owner !== undefined && owner !== boardId) throw new PrefixTakenError(prefix)
  }

  return {
    async boards() {
      return [...boards]
    },

    async createBoard(input) {
      const name = normalizeBoardName(input.name)
      const prefix = normalizePrefix(input.prefix)
      claim(prefix, null)
      const board: Board = { id: newId(), name, prefix }
      boards.push(board)
      counters.set(board.id, 0)
      prefixes.set(prefix, board.id)
      return board
    },

    async updateBoard(id, patch) {
      const index = boards.findIndex((board) => board.id === id)
      if (index < 0) return null
      const current = boards[index] as Board
      const name = patch.name === undefined ? current.name : normalizeBoardName(patch.name)
      const prefix = patch.prefix === undefined ? current.prefix : normalizePrefix(patch.prefix)
      claim(prefix, id)
      prefixes.set(prefix, id)
      const updated: Board = { ...current, name, prefix }
      boards[index] = updated
      return updated
    },

    async board(boardId) {
      if (!boards.some((board) => board.id === boardId)) return null
      const own = tasks.filter((task) => task.boardId === boardId)
      return { statuses: DEFAULT_STATUSES, tasks: orderTasks(DEFAULT_STATUSES, own) }
    },

    async create({ boardId, title, statusId }) {
      const board = boards.find((candidate) => candidate.id === boardId)
      if (!board) throw new BoardNotFoundError(boardId)
      const normalized = normalizeTitle(title)
      if (!DEFAULT_STATUSES.some((status) => status.id === statusId)) {
        throw new StatusNotFoundError(statusId)
      }
      const own = tasks.filter((task) => task.boardId === boardId)
      const top = orderTasks(DEFAULT_STATUSES, own).find((task) => task.statusId === statusId)
      const key = (counters.get(boardId) ?? 0) + 1
      counters.set(boardId, key)
      const task: Task = {
        id: newId(),
        boardId,
        key,
        keyPrefix: board.prefix,
        title: normalized,
        statusId,
        priority: 0,
        rank: rankBetween(undefined, top?.rank),
        completedAt: null,
        createdAt: now(),
        body: '',
      }
      tasks.push(task)
      return task
    },

    async update(key, patch) {
      const index = tasks.findIndex((task) => same(task, key))
      if (index < 0) return null
      const current = tasks[index] as Task
      const title = patch.title === undefined ? current.title : normalizeTitle(patch.title)
      if (patch.priority !== undefined && !isPriority(patch.priority)) {
        throw new InvalidPriorityError(patch.priority)
      }
      let placed: Pick<Task, 'statusId' | 'rank' | 'completedAt'> = current
      if (patch.placement) {
        const { statusId, rank } = patch.placement
        const status = DEFAULT_STATUSES.find((candidate) => candidate.id === statusId)
        if (!status) throw new StatusNotFoundError(statusId)
        if (!isRank(rank)) throw new InvalidRankError(rank)
        placed = { statusId, rank, completedAt: completionAfterMove(current.completedAt, status.category, now()) }
      }
      const updated: Task = {
        ...current,
        ...placed,
        title,
        priority: patch.priority ?? current.priority,
        body: patch.body ?? current.body,
      }
      tasks[index] = updated
      return updated
    },

    async delete(key) {
      const index = tasks.findIndex((task) => same(task, key))
      if (index < 0) return false
      const [removed] = tasks.splice(index, 1)
      if (removed) comments.delete(removed.id)
      return true
    },

    async comments(key) {
      const task = tasks.find((candidate) => same(candidate, key))
      if (!task) return null
      return [...(comments.get(task.id) ?? [])].sort(
        (a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      )
    },

    async addComment(key, body) {
      const task = tasks.find((candidate) => same(candidate, key))
      if (!task) return null
      const comment: TaskComment = { id: newId(), body: normalizeCommentBody(body), createdAt: now() }
      comments.set(task.id, [...(comments.get(task.id) ?? []), comment])
      return comment
    },

    async deleteComment(key, id) {
      const task = tasks.find((candidate) => same(candidate, key))
      if (!task) return 'task-not-found'
      const own = comments.get(task.id) ?? []
      if (!own.some((comment) => comment.id === id)) return 'comment-not-found'
      comments.set(
        task.id,
        own.filter((comment) => comment.id !== id),
      )
      return 'deleted'
    },
  }
}
