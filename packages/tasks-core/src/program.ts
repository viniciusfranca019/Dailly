import { NameRequiredError } from './board.js'
import type { TaskKey } from './task.js'

/**
 * Programs and focus (LAB-9), from the Workstation's activity model: a program
 * gathers tasks of any board under one objective and a window, and focus is the
 * attention level (P0, P1, P2) of a program or of a task with no program.
 *
 * The program keeps the list of its tasks, never the reverse (RN1 of the Tasks
 * PRD): a task carries no field for any aggregate, so it does not change on the
 * day one is born. A task sits in one program at most, because its parent is a
 * single level.
 */

export const FOCUS_LEVELS = ['P0', 'P1', 'P2'] as const
export type FocusLevel = (typeof FOCUS_LEVELS)[number]

export const isFocusLevel = (value: unknown): value is FocusLevel =>
  typeof value === 'string' && (FOCUS_LEVELS as readonly string[]).includes(value)

export interface Program {
  readonly id: string
  readonly name: string
  readonly objective: string
  /** `YYYY-MM-DD`, or null when the program has no window. */
  readonly windowStart: string | null
  readonly windowEnd: string | null
  readonly exitWhen: string
  /** The program's own level, or null when it is out of focus. */
  readonly focus: FocusLevel | null
}

export interface NewProgram {
  readonly name: string
  readonly objective: string
  readonly windowStart: string | null
  readonly windowEnd: string | null
  readonly exitWhen: string
}

/** A task as a program lists it: its whole key, title and status name. */
export interface ProgramTask {
  readonly key: string
  readonly title: string
  readonly status: string
  readonly boardId: string
}

/** A program with its tasks, in the order they joined. */
export interface ProgramWithTasks extends Program {
  readonly tasks: readonly ProgramTask[]
}

export type FocusItem =
  | { readonly kind: 'program'; readonly id: string; readonly name: string }
  | { readonly kind: 'task'; readonly key: string; readonly title: string }

/** Each level's items, in the order they were put there. */
export type FocusBoard = Readonly<Record<FocusLevel, readonly FocusItem[]>>

/** What focus is set on: a program by id, or a task by its key. */
export type FocusTarget = { readonly program: string } | { readonly task: TaskKey }

/** The task a program was asked to take does not exist. */
export class TaskNotFoundError extends Error {
  override readonly name = 'TaskNotFoundError'
  constructor() {
    super('tarefa não encontrada')
  }
}

export class InvalidWindowError extends Error {
  override readonly name = 'InvalidWindowError'
  constructor(
    message: string,
    /** The field to fix, so a form or a route never reads it from the message. */
    readonly field: 'windowStart' | 'windowEnd' = 'windowEnd',
  ) {
    super(message)
  }
}

export class InvalidFocusLevelError extends Error {
  override readonly name = 'InvalidFocusLevelError'
  constructor(readonly level: unknown) {
    super('o foco é P0, P1 ou P2')
  }
}

/** C4: a task sits in one program at most. */
export class TaskInOtherProgramError extends Error {
  override readonly name = 'TaskInOtherProgramError'
  constructor(
    readonly key: string,
    readonly programName: string,
  ) {
    super(`${key} já está no programa ${programName}`)
  }
}

/** C6: a task of a program inherits its focus, and never has one of its own. */
export class TaskInProgramFocusError extends Error {
  override readonly name = 'TaskInProgramFocusError'
  constructor(
    readonly key: string,
    readonly programName: string,
  ) {
    super(`${key} é do programa ${programName}: ponha o programa em foco`)
  }
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** A calendar date that exists, as `YYYY-MM-DD`. */
function parseDate(value: string | null | undefined, field: 'windowStart' | 'windowEnd'): string | null {
  if (value === undefined || value === null || value.trim() === '') return null
  const match = DATE.exec(value.trim())
  const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null
  if (!match || !date || date.toISOString().slice(0, 10) !== match[0]) {
    throw new InvalidWindowError('a data da janela é AAAA-MM-DD', field)
  }
  return match[0]
}

/** A new program, checked whole: the name, and a window whose end is not before its start (C2). */
export function parseNewProgram(input: {
  name: string
  objective?: string
  windowStart?: string | null
  windowEnd?: string | null
  exitWhen?: string
}): NewProgram {
  const name = input.name.trim()
  if (name === '') throw new NameRequiredError()
  const windowStart = parseDate(input.windowStart, 'windowStart')
  const windowEnd = parseDate(input.windowEnd, 'windowEnd')
  if (windowStart !== null && windowEnd !== null && windowEnd < windowStart) {
    throw new InvalidWindowError('o fim da janela vem depois do início')
  }
  return {
    name,
    objective: (input.objective ?? '').trim(),
    windowStart,
    windowEnd,
    exitWhen: (input.exitWhen ?? '').trim(),
  }
}
