import {
  BoardNotFoundError,
  PrefixTakenError,
  SEED_BOARD,
  normalizeBoardName,
  normalizePrefix,
  type Board,
} from './board.js'
import { normalizeCommentBody, type TaskComment } from './comment.js'
import { completionAfterMove, ranksOnTop } from './move.js'
import { SEARCH_LIMIT, matchesTitle, searchKey, type TaskSearchResult } from './search.js'
import {
  InvalidMoveToError,
  LastStatusError,
  SEED_STATUS_IDS,
  STATUS_SEED,
  StatusHasTasksError,
  StatusNameTakenError,
  isStatusColor,
  InvalidColorError,
  normalizeStatusName,
  orderStatuses,
  parseNewStatus,
  sameStatusName,
  type StoredStatus,
} from './status.js'
import { rankBetween } from './rank.js'
import {
  InvalidLabelError,
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
  /**
   * The ids of the global labels that exist (card #46): the store only reads
   * them, as the SQLite one reads the `labels` table. None by default.
   */
  readonly labels?: () => readonly string[]
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
export function inMemoryTaskStore({ newId, now, labels = () => [] }: InMemoryTaskStoreDeps): TaskStore {
  const boards: Board[] = [SEED_BOARD]
  /** The last number each board handed out (RN5). */
  const counters = new Map<string, number>([[SEED_BOARD.id, 0]])
  /** Every prefix a board ever used, and whose it is (RN9). */
  const prefixes = new Map<string, string>([[SEED_BOARD.prefix, SEED_BOARD.id]])
  const tasks: Task[] = []
  let createdOrder = 0
  const seedOf = (boardId: string, ids: readonly string[]): StoredStatus[] =>
    STATUS_SEED.map((seed, index) => ({ ...seed, id: ids[index] as string, boardId, createdOrder: (createdOrder += 1) }))
  const statuses: StoredStatus[] = seedOf(SEED_BOARD.id, SEED_STATUS_IDS)
  const statusesOf = (boardId: string) => orderStatuses(statuses.filter((status) => status.boardId === boardId))
  /** A status of that board, or nothing: a status of another board is not found (#43). */
  const statusIn = (boardId: string, statusId: string) =>
    statuses.find((status) => status.id === statusId && status.boardId === boardId)
  const claimName = (boardId: string, name: string, except: string | null) => {
    if (statuses.some((status) => status.boardId === boardId && status.id !== except && sameStatusName(status.name, name))) {
      throw new StatusNameTakenError(name)
    }
  }
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
      statuses.push(...seedOf(board.id, STATUS_SEED.map(() => newId())))
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
      const ordered = statusesOf(boardId)
      return { statuses: ordered, tasks: orderTasks(ordered, own) }
    },

    async create({ boardId, title, statusId }) {
      const board = boards.find((candidate) => candidate.id === boardId)
      if (!board) throw new BoardNotFoundError(boardId)
      const normalized = normalizeTitle(title)
      if (!statusIn(boardId, statusId)) throw new StatusNotFoundError(statusId)
      const own = tasks.filter((task) => task.boardId === boardId)
      const top = orderTasks(statusesOf(boardId), own).find((task) => task.statusId === statusId)
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
        labelIds: [],
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
      if (patch.labelIds && !patch.labelIds.every((id) => labels().includes(id))) throw new InvalidLabelError()
      let placed: Pick<Task, 'statusId' | 'rank' | 'completedAt'> = current
      if (patch.placement) {
        const { statusId, rank } = patch.placement
        const status = statusIn(current.boardId, statusId)
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
        labelIds: patch.labelIds ? [...new Set(patch.labelIds)] : current.labelIds,
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

    async search(text) {
      if (text.trim() === '') return []
      const named = searchKey(text)
      const exact = named ? tasks.filter((task) => same(task, named)) : []
      // Newest first: by the creation instant, then by the order they were made.
      const byTitle = [...tasks]
        .reverse()
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
        .filter((task) => !exact.includes(task) && matchesTitle(task.title, text))
      const boardName = (id: string) => boards.find((board) => board.id === id)?.name ?? ''
      return [...exact, ...byTitle].slice(0, SEARCH_LIMIT).map(
        (task): TaskSearchResult => ({
          key: task.key,
          keyPrefix: task.keyPrefix,
          title: task.title,
          boardId: task.boardId,
          boardName: boardName(task.boardId),
        }),
      )
    },

    async addStatus(boardId, input) {
      if (!boards.some((board) => board.id === boardId)) return null
      const parsed = parseNewStatus(input)
      claimName(boardId, parsed.name, null)
      const id = newId()
      statuses.push({ ...parsed, id, boardId, createdOrder: (createdOrder += 1) })
      return statusesOf(boardId).find((status) => status.id === id) ?? null
    },

    async updateStatus(id, patch) {
      const index = statuses.findIndex((status) => status.id === id)
      if (index < 0) return null
      const current = statuses[index] as StoredStatus
      const name = patch.name === undefined ? current.name : normalizeStatusName(patch.name)
      if (patch.color !== undefined && !isStatusColor(patch.color)) throw new InvalidColorError(patch.color)
      claimName(current.boardId, name, id)
      statuses[index] = { ...current, name, color: patch.color ?? current.color }
      return statusesOf(current.boardId).find((status) => status.id === id) ?? null
    },

    async deleteStatus(id, moveTo) {
      const current = statuses.find((status) => status.id === id)
      if (!current) return false
      const board = statusesOf(current.boardId)
      if (board.length === 1) throw new LastStatusError()
      const moving = orderTasks(board, tasks.filter((task) => task.statusId === id))
      if (moving.length > 0 && moveTo === undefined) throw new StatusHasTasksError()
      let target: StoredStatus | undefined
      if (moveTo !== undefined) {
        target = statusIn(current.boardId, moveTo)
        if (!target || target.id === id) throw new InvalidMoveToError('o destino deve ser outro status do mesmo board')
      }
      if (target) {
        const destination = target
        const top = orderTasks(board, tasks.filter((task) => task.statusId === destination.id))[0]
        const ranks = ranksOnTop(moving.length, top?.rank)
        const at = now()
        moving.forEach((task, index) => {
          const position = tasks.findIndex((candidate) => candidate.id === task.id)
          tasks[position] = {
            ...task,
            statusId: destination.id,
            rank: ranks[index] as string,
            completedAt: completionAfterMove(task.completedAt, destination.category, at),
          }
        })
      }
      statuses.splice(statuses.indexOf(current), 1)
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
