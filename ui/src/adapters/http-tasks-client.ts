import {
  STATUS_COLORS,
  formatKey,
  type StatusColor,
  type Board,
  type Priority,
  type StatusCategory,
  type Task,
  type TaskBoard,
  type TaskComment,
  type TaskKey,
  type TaskSearchResult,
  type TaskStatus,
} from '@dailly/tasks-core'
import type { TasksPort } from '@shared'
import type { ApiConfig } from './api.js'
import { ApiError } from './errors.js'
import { httpClient } from './http.js'

export interface HttpTasksClientDeps {
  readonly config: ApiConfig
  readonly fetch?: typeof globalThis.fetch
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const wrongShape = (what: string) => new ApiError(200, `a API respondeu ${what} num formato que não reconheço`)

const CATEGORIES: readonly StatusCategory[] = ['backlog', 'unstarted', 'started', 'completed', 'canceled']
const PRIORITIES: readonly number[] = [0, 1, 2, 3, 4]

const parseStatus = (value: unknown): TaskStatus => {
  if (
    !isRecord(value) ||
    typeof value['id'] !== 'string' ||
    typeof value['boardId'] !== 'string' ||
    typeof value['name'] !== 'string' ||
    typeof value['position'] !== 'number' ||
    !CATEGORIES.includes(value['category'] as StatusCategory) ||
    !(STATUS_COLORS as readonly unknown[]).includes(value['color'])
  ) {
    throw wrongShape('um status')
  }
  return {
    id: value['id'],
    boardId: value['boardId'],
    name: value['name'],
    category: value['category'] as StatusCategory,
    color: value['color'] as StatusColor,
    position: value['position'],
  }
}

const parseTask = (value: unknown): Task => {
  if (
    !isRecord(value) ||
    typeof value['id'] !== 'string' ||
    typeof value['boardId'] !== 'string' ||
    typeof value['key'] !== 'number' ||
    typeof value['keyPrefix'] !== 'string' ||
    typeof value['title'] !== 'string' ||
    typeof value['statusId'] !== 'string' ||
    !PRIORITIES.includes(value['priority'] as number) ||
    typeof value['rank'] !== 'string' ||
    (value['completedAt'] !== null && typeof value['completedAt'] !== 'string') ||
    typeof value['createdAt'] !== 'string' ||
    typeof value['body'] !== 'string'
  ) {
    throw wrongShape('uma tarefa')
  }
  return {
    id: value['id'],
    boardId: value['boardId'],
    key: value['key'],
    keyPrefix: value['keyPrefix'],
    title: value['title'],
    statusId: value['statusId'],
    priority: value['priority'] as Priority,
    rank: value['rank'],
    completedAt: value['completedAt'],
    createdAt: value['createdAt'],
    body: value['body'],
  }
}

const parseBoard = (value: unknown): TaskBoard => {
  if (!isRecord(value) || !Array.isArray(value['statuses']) || !Array.isArray(value['tasks'])) {
    throw wrongShape('o board')
  }
  return { statuses: value['statuses'].map(parseStatus), tasks: value['tasks'].map(parseTask) }
}

const parseBoardInfo = (value: unknown): Board => {
  if (
    !isRecord(value) ||
    typeof value['id'] !== 'string' ||
    typeof value['name'] !== 'string' ||
    typeof value['prefix'] !== 'string'
  ) {
    throw wrongShape('um board')
  }
  return { id: value['id'], name: value['name'], prefix: value['prefix'] }
}

const parseComment = (value: unknown): TaskComment => {
  if (
    !isRecord(value) ||
    typeof value['id'] !== 'string' ||
    typeof value['body'] !== 'string' ||
    typeof value['createdAt'] !== 'string'
  ) {
    throw wrongShape('um comentário')
  }
  return { id: value['id'], body: value['body'], createdAt: value['createdAt'] }
}

const parseResult = (value: unknown): TaskSearchResult => {
  if (
    !isRecord(value) ||
    typeof value['key'] !== 'number' ||
    typeof value['keyPrefix'] !== 'string' ||
    typeof value['title'] !== 'string' ||
    typeof value['boardId'] !== 'string' ||
    typeof value['boardName'] !== 'string'
  ) {
    throw wrongShape('um resultado da busca')
  }
  return {
    key: value['key'],
    keyPrefix: value['keyPrefix'],
    title: value['title'],
    boardId: value['boardId'],
    boardName: value['boardName'],
  }
}

const path = ({ prefix, key }: TaskKey) => `/tasks/${encodeURIComponent(formatKey(prefix, key))}`

/** 404 is an answer here, not a failure: the thing is gone, and the caller says so. */
async function orGone<T>(call: () => Promise<T>, gone: T): Promise<T> {
  try {
    return await call()
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return gone
    throw error
  }
}

/** The Tasks port over the local API, with the payload parsed at the boundary. */
export function httpTasksClient(deps: HttpTasksClientDeps): TasksPort {
  const call = httpClient(deps)
  return {
    async boards() {
      const answer = await call('/boards')
      if (!Array.isArray(answer)) throw wrongShape('os boards')
      return answer.map(parseBoardInfo)
    },
    async createBoard(input) {
      return parseBoardInfo(
        await call('/boards', { method: 'POST', body: JSON.stringify({ name: input.name, prefix: input.prefix }) }),
      )
    },
    async updateBoard(id, patch) {
      return orGone(
        async () =>
          parseBoardInfo(
            await call(`/boards/${encodeURIComponent(id)}`, {
              method: 'PATCH',
              body: JSON.stringify({
                ...(patch.name !== undefined ? { name: patch.name } : {}),
                ...(patch.prefix !== undefined ? { prefix: patch.prefix } : {}),
              }),
            }),
          ),
        null,
      )
    },
    async board(boardId) {
      return orGone(async () => parseBoard(await call(`/tasks?boardId=${encodeURIComponent(boardId)}`)), null)
    },
    async create(input) {
      return parseTask(
        await call('/tasks', {
          method: 'POST',
          body: JSON.stringify({ boardId: input.boardId, title: input.title, statusId: input.statusId }),
        }),
      )
    },
    async update(key, patch) {
      try {
        return parseTask(
          await call(path(key), {
            method: 'PATCH',
            body: JSON.stringify({
              ...(patch.title !== undefined ? { title: patch.title } : {}),
              ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
              ...(patch.body !== undefined ? { body: patch.body } : {}),
              ...(patch.placement ? { statusId: patch.placement.statusId, rank: patch.placement.rank } : {}),
            }),
          }),
        )
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
    async delete(key) {
      try {
        await call(path(key), { method: 'DELETE' })
        return true
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return false
        throw error
      }
    },
    async comments(key) {
      return orGone(async () => {
        const answer = await call(`${path(key)}/comments`)
        if (!Array.isArray(answer)) throw wrongShape('os comentários')
        return answer.map(parseComment)
      }, null)
    },
    async addComment(key, body) {
      return orGone(
        async () => parseComment(await call(`${path(key)}/comments`, { method: 'POST', body: JSON.stringify({ body }) })),
        null,
      )
    },
    async deleteComment(key, id) {
      return orGone(async () => {
        await call(`${path(key)}/comments/${encodeURIComponent(id)}`, { method: 'DELETE' })
        return true
      }, false)
    },
    async addStatus(boardId, input) {
      return orGone(
        async () =>
          parseStatus(
            await call(`/boards/${encodeURIComponent(boardId)}/statuses`, {
              method: 'POST',
              body: JSON.stringify({ name: input.name, category: input.category, color: input.color }),
            }),
          ),
        null,
      )
    },
    async updateStatus(id, patch) {
      return orGone(
        async () =>
          parseStatus(
            await call(`/statuses/${encodeURIComponent(id)}`, {
              method: 'PATCH',
              body: JSON.stringify({
                ...(patch.name !== undefined ? { name: patch.name } : {}),
                ...(patch.color !== undefined ? { color: patch.color } : {}),
              }),
            }),
          ),
        null,
      )
    },
    async deleteStatus(id, moveTo) {
      const query = moveTo === undefined ? '' : `?moveTo=${encodeURIComponent(moveTo)}`
      return orGone(async () => {
        await call(`/statuses/${encodeURIComponent(id)}${query}`, { method: 'DELETE' })
        return true
      }, false)
    },
    async search(text) {
      if (text.trim() === '') return []
      const answer = await call(`/tasks/search?q=${encodeURIComponent(text)}`)
      if (!isRecord(answer) || !Array.isArray(answer['results'])) throw wrongShape('a busca')
      return answer['results'].map(parseResult)
    },
  }
}
