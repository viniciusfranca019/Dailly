import { rankBetween } from './rank.js'
import type { StatusCategory } from './task.js'
import type { TaskBoard } from './task-store.js'

export interface Placement {
  readonly statusId: string
  readonly rank: string
}

/**
 * Where a card dropped on the board lands: in `statusId`, right above the card
 * `beforeKey`, or at the bottom of the column when it was dropped on no card.
 *
 * Pure and shared, so the board computes the rank it sends and the tests pin
 * the rule without a DOM. The dragged card is not its own neighbour: moving T-2
 * above T-1 in the same column must look past T-2's current place.
 */
export function placeAt(
  board: TaskBoard,
  key: number,
  statusId: string,
  beforeKey: number | null,
): Placement {
  const column = board.tasks.filter((task) => task.statusId === statusId && task.key !== key)
  const index = beforeKey === null ? column.length : column.findIndex((task) => task.key === beforeKey)
  const at = index < 0 ? column.length : index
  return { statusId, rank: rankBetween(column[at - 1]?.rank, column[at]?.rank) }
}

const CLOSED: readonly StatusCategory[] = ['completed', 'canceled']

/**
 * RN3: entering a closed category stamps the instant, leaving it clears it.
 * Between two closed ones (Feito → Cancelado) the first stamp stays: the task
 * was closed then, and "what I closed in the period" reads that instant.
 */
export function completionAfterMove(
  current: string | null,
  target: StatusCategory,
  now: string,
): string | null {
  if (!CLOSED.includes(target)) return null
  return current ?? now
}
