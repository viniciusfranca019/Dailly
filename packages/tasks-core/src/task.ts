/**
 * A task: an Entry plus the facet the Tasks module adds to it (PRD RN1).
 *
 * `id` is the Entry's UUID, the same one, so a future aggregate (project,
 * epic) points at the Entry and the atom never grows a `projectId`. `key` is
 * the readable number behind `<PREFIX>-<n>`, sequential inside the board and
 * never reused (RN5). `keyPrefix` is the board's prefix when the task was
 * born, frozen: renaming the prefix only changes the tasks created after.
 */
export interface Task {
  readonly id: string
  readonly boardId: string
  readonly key: number
  readonly keyPrefix: string
  readonly title: string
  readonly statusId: string
  /** 0 none, 1 urgent, 2 high, 3 medium, 4 low (RN8, Linear's levels). */
  readonly priority: Priority
  /** Fractional index inside the status; see `rankBetween`. */
  readonly rank: string
  /** Set on entering a completed or canceled status (RN3, from F2 on). */
  readonly completedAt: string | null
  readonly createdAt: string
  /** The Entry's body: the task's description, markdown, empty at capture. */
  readonly body: string
}

export type Priority = 0 | 1 | 2 | 3 | 4

/** Linear's words for each level, in the order of the number. */
export const PRIORITY_LABELS: Readonly<Record<Priority, string>> = {
  0: 'sem',
  1: 'urgente',
  2: 'alta',
  3: 'média',
  4: 'baixa',
}

export type { StatusCategory, TaskStatus } from './status.js'

/** A task's key in full: unique across boards, because a prefix is never shared (RN9). */
export interface TaskKey {
  readonly prefix: string
  readonly key: number
}

export const formatKey = (prefix: string, key: number): string => `${prefix}-${key}`

/** `CASA-12` → { prefix: 'CASA', key: 12 }; anything else, lowercase included, is not a key. */
export function parseKey(text: string): TaskKey | null {
  const match = /^([A-Z0-9]{1,6})-([1-9][0-9]*)$/.exec(text)
  return match ? { prefix: match[1] as string, key: Number(match[2]) } : null
}

export class TitleRequiredError extends Error {
  override readonly name = 'TitleRequiredError'
  constructor() {
    super('o título é obrigatório')
  }
}

export class StatusNotFoundError extends Error {
  override readonly name = 'StatusNotFoundError'
  constructor(readonly statusId: string) {
    super(`não existe status ${statusId}`)
  }
}

export class InvalidPriorityError extends Error {
  override readonly name = 'InvalidPriorityError'
  constructor(readonly priority: unknown) {
    super(`prioridade inválida: ${JSON.stringify(priority)} (de 0 a 4)`)
  }
}

export const isPriority = (value: unknown): value is Priority =>
  value === 0 || value === 1 || value === 2 || value === 3 || value === 4

export class InvalidRankError extends Error {
  override readonly name = 'InvalidRankError'
  constructor(readonly rank: string) {
    super(`rank inválido: ${JSON.stringify(rank)}`)
  }
}

/** The shape `rankBetween` produces: base-36 digits, never ending in '0'. */
export const isRank = (rank: string): boolean => /^[0-9a-z]*[1-9a-z]$/.test(rank)

/** The title as it is stored: trimmed, and never empty (C5). */
export function normalizeTitle(title: string): string {
  const trimmed = title.trim()
  if (trimmed === '') throw new TitleRequiredError()
  return trimmed
}
