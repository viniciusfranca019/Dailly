import { NameRequiredError } from './board.js'

/**
 * The five fixed categories (RN2). Rules, column order and reports read the
 * category, never the name, so renaming "Feito" cannot break the Analyse.
 */
export type StatusCategory = 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled'

/** The order of the columns (RN11): the category's, then the creation's inside it. */
export const CATEGORY_ORDER: readonly StatusCategory[] = ['backlog', 'unstarted', 'started', 'completed', 'canceled']

/**
 * The palette of a status, the eight names of the Daily Log labels. Kept here
 * and not imported from `@dailly/domain`, which would be a new dependency of
 * this package; the names are what is stored, the pixels are the screen's.
 */
export const STATUS_COLORS = ['blue', 'green', 'yellow', 'orange', 'red', 'purple', 'pink', 'gray'] as const
export type StatusColor = (typeof STATUS_COLORS)[number]

export const isStatusColor = (value: unknown): value is StatusColor =>
  typeof value === 'string' && (STATUS_COLORS as readonly string[]).includes(value)
export const isStatusCategory = (value: unknown): value is StatusCategory =>
  typeof value === 'string' && (CATEGORY_ORDER as readonly string[]).includes(value)

/** A status of one board (F5, card #43). `position` is the index in the board's order. */
export interface TaskStatus {
  readonly id: string
  readonly boardId: string
  readonly name: string
  readonly category: StatusCategory
  readonly color: StatusColor
  readonly position: number
}

export interface NewStatus {
  readonly name: string
  readonly category: StatusCategory
  readonly color: StatusColor
}

/** What one save of a status changes (J6.2): the category is not editable (RN3). */
export interface StatusPatch {
  readonly name?: string
  readonly color?: StatusColor
}

/**
 * What every board is born with (RN11): name, category and color, no id. The
 * migration seeds it in every board, and so does a new board.
 */
export const STATUS_SEED: readonly NewStatus[] = [
  { name: 'Backlog', category: 'backlog', color: 'gray' },
  { name: 'A fazer', category: 'unstarted', color: 'gray' },
  { name: 'Fazendo', category: 'started', color: 'yellow' },
  { name: 'Feito', category: 'completed', color: 'blue' },
  { name: 'Cancelado', category: 'canceled', color: 'gray' },
]

/** The ids the v1 statuses had; they stay the "Tasks" board's (RN10), where `tasks.status_id` points. */
export const SEED_STATUS_IDS = ['backlog', 'todo', 'doing', 'done', 'canceled'] as const

/** The seed of one board, with the ids given, in its order. */
export function seedStatusesFor(boardId: string, ids: readonly string[]): TaskStatus[] {
  return STATUS_SEED.map((seed, index) => ({ ...seed, id: ids[index] as string, boardId, position: index }))
}

/** A stored status before it is ordered: its creation order inside the board. */
export type StoredStatus = Omit<TaskStatus, 'position'> & { readonly createdOrder: number }

/** The board's columns, in order (RN11), each with its `position`. */
export function orderStatuses(statuses: readonly StoredStatus[]): TaskStatus[] {
  return [...statuses]
    .sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.createdOrder - b.createdOrder,
    )
    .map(({ createdOrder: _order, ...status }, position) => ({ ...status, position }))
}

export class InvalidColorError extends Error {
  override readonly name = 'InvalidColorError'
  constructor(readonly color: unknown) {
    super(`cor inválida: ${JSON.stringify(color)} (${STATUS_COLORS.join(', ')})`)
  }
}

export class InvalidCategoryError extends Error {
  override readonly name = 'InvalidCategoryError'
  constructor(readonly category: unknown) {
    super(`categoria inválida: ${JSON.stringify(category)}`)
  }
}

export class StatusNameTakenError extends Error {
  override readonly name = 'StatusNameTakenError'
  constructor(readonly statusName: string) {
    super(`já existe um status "${statusName}" neste board`)
  }
}

export class StatusHasTasksError extends Error {
  override readonly name = 'StatusHasTasksError'
  constructor() {
    super('o status tem tarefas: escolha para onde elas vão')
  }
}

export class LastStatusError extends Error {
  override readonly name = 'LastStatusError'
  constructor() {
    super('o board precisa de ao menos um status')
  }
}

export class InvalidMoveToError extends Error {
  override readonly name = 'InvalidMoveToError'
}

/** The name as stored: trimmed, and never empty (J6.1a). */
export function normalizeStatusName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') throw new NameRequiredError()
  return trimmed
}

/** Two names that read the same in the board collide, case aside: "feito" is "Feito". */
export const sameStatusName = (a: string, b: string): boolean =>
  a.toLocaleLowerCase('pt-BR') === b.toLocaleLowerCase('pt-BR')

/** A new status, checked whole: the name, the category and the color. */
export function parseNewStatus(input: { name: string; category: unknown; color: unknown }): NewStatus {
  const name = normalizeStatusName(input.name)
  if (!isStatusCategory(input.category)) throw new InvalidCategoryError(input.category)
  if (!isStatusColor(input.color)) throw new InvalidColorError(input.color)
  return { name, category: input.category, color: input.color }
}
