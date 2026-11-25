import {
  FOCUS_LEVELS,
  formatKey,
  isFocusLevel,
  type FocusBoard,
  type FocusItem,
  type Program,
  type ProgramTask,
  type ProgramWithTasks,
} from '@dailly/tasks-core'
import type { ProgramsPort } from '@shared'
import type { ApiConfig } from './api.js'
import { ApiError } from './errors.js'
import { httpClient } from './http.js'

export interface HttpProgramsClientDeps {
  readonly config: ApiConfig
  readonly fetch?: typeof globalThis.fetch
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string'
const isTextOrNull = (value: unknown): value is string | null => value === null || typeof value === 'string'

const wrongShape = (what: string) => new ApiError(200, `a API respondeu ${what} num formato que não reconheço`)

const parseProgram = (value: unknown): Program => {
  if (
    !isRecord(value) ||
    !isText(value['id']) ||
    !isText(value['name']) ||
    !isText(value['objective']) ||
    !isTextOrNull(value['windowStart']) ||
    !isTextOrNull(value['windowEnd']) ||
    !isText(value['exitWhen']) ||
    !(value['focus'] === null || isFocusLevel(value['focus']))
  ) {
    throw wrongShape('um programa')
  }
  return {
    id: value['id'],
    name: value['name'],
    objective: value['objective'],
    windowStart: value['windowStart'],
    windowEnd: value['windowEnd'],
    exitWhen: value['exitWhen'],
    focus: value['focus'],
  }
}

const parseProgramTask = (value: unknown): ProgramTask => {
  if (!isRecord(value) || !isText(value['key']) || !isText(value['title']) || !isText(value['status']) || !isText(value['boardId'])) {
    throw wrongShape('uma tarefa do programa')
  }
  return { key: value['key'], title: value['title'], status: value['status'], boardId: value['boardId'] }
}

const parseWithTasks = (value: unknown): ProgramWithTasks => {
  if (!isRecord(value) || !Array.isArray(value['tasks'])) throw wrongShape('um programa')
  return { ...parseProgram(value), tasks: value['tasks'].map(parseProgramTask) }
}

const parseFocusItem = (value: unknown): FocusItem => {
  if (isRecord(value) && value['kind'] === 'program' && isText(value['id']) && isText(value['name'])) {
    return { kind: 'program', id: value['id'], name: value['name'] }
  }
  if (isRecord(value) && value['kind'] === 'task' && isText(value['key']) && isText(value['title'])) {
    return { kind: 'task', key: value['key'], title: value['title'] }
  }
  throw wrongShape('o foco')
}

const parseFocus = (value: unknown): FocusBoard => {
  if (!isRecord(value) || !FOCUS_LEVELS.every((level) => Array.isArray(value[level]))) throw wrongShape('o foco')
  return {
    P0: (value['P0'] as unknown[]).map(parseFocusItem),
    P1: (value['P1'] as unknown[]).map(parseFocusItem),
    P2: (value['P2'] as unknown[]).map(parseFocusItem),
  }
}

/** The API's words for a task that does not exist (`TASK_NOT_FOUND` in the Tasks routes). */
const TASK_NOT_FOUND = 'tarefa não encontrada'

/** 404 is an answer here: the thing is gone, and the caller says so. */
async function orGone<T>(call: () => Promise<T>, gone: T): Promise<T> {
  try {
    return await call()
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return gone
    throw error
  }
}

/** Programs and focus over the local API (LAB-9), the payload parsed at the boundary. */
export function httpProgramsClient(deps: HttpProgramsClientDeps): ProgramsPort {
  const call = httpClient(deps)
  return {
    async programs() {
      const answer = await call('/programs')
      if (!Array.isArray(answer)) throw wrongShape('os programas')
      return answer.map(parseWithTasks)
    },
    async createProgram(input) {
      return parseProgram(await call('/programs', { method: 'POST', body: JSON.stringify(input) }))
    },
    async addToProgram(programId, key) {
      try {
        return parseWithTasks(
          await call(`/programs/${encodeURIComponent(programId)}/tasks`, { method: 'POST', body: JSON.stringify({ key }) }),
        )
      } catch (error) {
        // Two 404s come back here: the program is gone (null), or the task does
        // not exist, which is a refusal the person can fix and is thrown.
        if (error instanceof ApiError && error.status === 404 && error.message !== TASK_NOT_FOUND) return null
        throw error
      }
    },
    async programOf({ prefix, key }) {
      return orGone(async () => {
        const answer = await call(`/tasks/${encodeURIComponent(formatKey(prefix, key))}/program`)
        if (!isRecord(answer) || !('program' in answer)) throw wrongShape('o programa da tarefa')
        return { program: answer['program'] === null ? null : parseProgram(answer['program']) }
      }, null)
    },
    async focus() {
      return parseFocus(await call('/focus'))
    },
    async setFocus(target, level) {
      return orGone(async () => {
        await call('/focus', { method: 'PUT', body: JSON.stringify({ ...target, level }) })
        return true
      }, false)
    },
  }
}
