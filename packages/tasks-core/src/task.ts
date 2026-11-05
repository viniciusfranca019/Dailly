/**
 * A task: an Entry plus the facet the Tasks module adds to it (PRD RN1).
 *
 * `id` is the Entry's UUID, the same one, so a future aggregate (project,
 * epic) points at the Entry and the atom never grows a `projectId`. `key` is
 * the readable number behind `T-<n>`; it is never reused (RN5).
 */
export interface Task {
  readonly id: string
  readonly key: number
  readonly title: string
  readonly statusId: string
  /** 0 none, 1 urgent, 2 high, 3 medium, 4 low (RN8, Linear's levels). */
  readonly priority: Priority
  /** Fractional index inside the status; see `rankBetween`. */
  readonly rank: string
  /** Set on entering a completed or canceled status (RN3, from F2 on). */
  readonly completedAt: string | null
  readonly createdAt: string
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

/**
 * The five fixed categories (RN2). Rules, column order and reports read the
 * category, never the name, so renaming "Feito" cannot break the Analyse.
 */
export type StatusCategory = 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled'

export interface TaskStatus {
  readonly id: string
  readonly name: string
  readonly category: StatusCategory
  readonly position: number
}

/**
 * The statuses every store is born with. The v1 does not edit them (out of
 * scope), so a store that seeds anything else breaks the contract suite.
 */
export const DEFAULT_STATUSES: readonly TaskStatus[] = [
  { id: 'backlog', name: 'Backlog', category: 'backlog', position: 0 },
  { id: 'todo', name: 'A fazer', category: 'unstarted', position: 1 },
  { id: 'doing', name: 'Fazendo', category: 'started', position: 2 },
  { id: 'done', name: 'Feito', category: 'completed', position: 3 },
  { id: 'canceled', name: 'Cancelado', category: 'canceled', position: 4 },
]

export const formatKey = (key: number): string => `T-${key}`

/** `T-12` → 12; anything else, lowercase included, is not a key. */
export function parseKey(text: string): number | null {
  const match = /^T-([1-9][0-9]*)$/.exec(text)
  return match ? Number(match[1]) : null
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
