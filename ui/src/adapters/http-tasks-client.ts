import type { Priority, StatusCategory, Task, TaskBoard, TaskStatus } from '@dailly/tasks-core'
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
    typeof value['name'] !== 'string' ||
    typeof value['position'] !== 'number' ||
    !CATEGORIES.includes(value['category'] as StatusCategory)
  ) {
    throw wrongShape('um status')
  }
  return {
    id: value['id'],
    name: value['name'],
    category: value['category'] as StatusCategory,
    position: value['position'],
  }
}

const parseTask = (value: unknown): Task => {
  if (
    !isRecord(value) ||
    typeof value['id'] !== 'string' ||
    typeof value['key'] !== 'number' ||
    typeof value['title'] !== 'string' ||
    typeof value['statusId'] !== 'string' ||
    !PRIORITIES.includes(value['priority'] as number) ||
    typeof value['rank'] !== 'string' ||
    (value['completedAt'] !== null && typeof value['completedAt'] !== 'string') ||
    typeof value['createdAt'] !== 'string'
  ) {
    throw wrongShape('uma tarefa')
  }
  return {
    id: value['id'],
    key: value['key'],
    title: value['title'],
    statusId: value['statusId'],
    priority: value['priority'] as Priority,
    rank: value['rank'],
    completedAt: value['completedAt'],
    createdAt: value['createdAt'],
  }
}

const parseBoard = (value: unknown): TaskBoard => {
  if (!isRecord(value) || !Array.isArray(value['statuses']) || !Array.isArray(value['tasks'])) {
    throw wrongShape('o board')
  }
  return { statuses: value['statuses'].map(parseStatus), tasks: value['tasks'].map(parseTask) }
}

/** The Tasks port over the local API, with the payload parsed at the boundary. */
export function httpTasksClient(deps: HttpTasksClientDeps): TasksPort {
  const call = httpClient(deps)
  return {
    async board() {
      return parseBoard(await call('/tasks'))
    },
    async create(input) {
      return parseTask(
        await call('/tasks', {
          method: 'POST',
          body: JSON.stringify({ title: input.title, statusId: input.statusId }),
        }),
      )
    },
  }
}
