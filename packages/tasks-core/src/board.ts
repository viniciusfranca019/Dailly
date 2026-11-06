/**
 * A board: a set of tasks with its own key prefix (F4, J5).
 *
 * The prefix is what makes `CASA-3` readable and unique: the number is
 * sequential inside the board, and a prefix one board has used is never taken
 * by another (RN9), so a key frozen on a task (RN5) never collides.
 */
export interface Board {
  readonly id: string
  readonly name: string
  readonly prefix: string
}

export interface NewBoard {
  readonly name: string
  readonly prefix: string
}

/** What one save of a board changes; any subset. */
export interface BoardPatch {
  readonly name?: string
  readonly prefix?: string
}

/**
 * The board every store is born with (RN10): the tasks from before the v2
 * live in it, with the T-<n> keys the Daily Log may already cite.
 */
export const SEED_BOARD: Board = { id: 'tasks', name: 'Tasks', prefix: 'T' }

export const PREFIX_MAX_LENGTH = 6

export class InvalidPrefixError extends Error {
  override readonly name = 'InvalidPrefixError'
}

export class PrefixTakenError extends Error {
  override readonly name = 'PrefixTakenError'
  constructor(readonly prefix: string) {
    super(`o prefixo ${prefix} já foi usado por um board`)
  }
}

export class NameRequiredError extends Error {
  override readonly name = 'NameRequiredError'
  constructor() {
    super('o nome é obrigatório')
  }
}

export class BoardNotFoundError extends Error {
  override readonly name = 'BoardNotFoundError'
  constructor(readonly boardId: string) {
    super('board não encontrado')
  }
}

/**
 * The prefix as it is stored, or the reason it is refused (J5.1a). The same
 * function runs on the screen and in the server, so the form refuses without
 * a round trip and the API refuses what a caller skipped. Lowercase is
 * refused, not converted: the field uppercases as the person types, and the
 * API keeps the rule visible to whoever calls it.
 */
export function normalizePrefix(prefix: string): string {
  const trimmed = prefix.trim()
  if (trimmed === '') throw new InvalidPrefixError('o prefixo é obrigatório')
  if (!/^[A-Z0-9]+$/.test(trimmed)) throw new InvalidPrefixError('o prefixo usa só letras de A a Z e números')
  if (trimmed.length > PREFIX_MAX_LENGTH) {
    throw new InvalidPrefixError(`o prefixo tem no máximo ${PREFIX_MAX_LENGTH} caracteres`)
  }
  return trimmed
}

/** The name as it is stored: trimmed, and never empty (J5.1b). */
export function normalizeBoardName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') throw new NameRequiredError()
  return trimmed
}
