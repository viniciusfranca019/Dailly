import { completionAfterMove } from './move.js'
import { rankBetween } from './rank.js'
import {
  DEFAULT_STATUSES,
  InvalidRankError,
  StatusNotFoundError,
  isRank,
  normalizeTitle,
  type Task,
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
  const tasks: Task[] = []
  let lastKey = 0

  return {
    async board() {
      return { statuses: DEFAULT_STATUSES, tasks: orderTasks(DEFAULT_STATUSES, tasks) }
    },

    async create({ title, statusId }) {
      const normalized = normalizeTitle(title)
      if (!DEFAULT_STATUSES.some((status) => status.id === statusId)) {
        throw new StatusNotFoundError(statusId)
      }
      const top = orderTasks(DEFAULT_STATUSES, tasks).find((task) => task.statusId === statusId)
      lastKey += 1
      const task: Task = {
        id: newId(),
        key: lastKey,
        title: normalized,
        statusId,
        priority: 0,
        rank: rankBetween(undefined, top?.rank),
        completedAt: null,
        createdAt: now(),
      }
      tasks.push(task)
      return task
    },

    async move(key, { statusId, rank }) {
      const index = tasks.findIndex((task) => task.key === key)
      if (index < 0) return null
      const status = DEFAULT_STATUSES.find((candidate) => candidate.id === statusId)
      if (!status) throw new StatusNotFoundError(statusId)
      if (!isRank(rank)) throw new InvalidRankError(rank)
      const current = tasks[index] as Task
      const moved: Task = {
        ...current,
        statusId,
        rank,
        completedAt: completionAfterMove(current.completedAt, status.category, now()),
      }
      tasks[index] = moved
      return moved
    },

    async delete(key) {
      const index = tasks.findIndex((task) => task.key === key)
      if (index < 0) return false
      tasks.splice(index, 1)
      return true
    },
  }
}
