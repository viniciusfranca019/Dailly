import { describe, expect, it } from 'vitest'
import { completionAfterMove, placeAt } from './move.js'
import { DEFAULT_STATUSES, type Task } from './task.js'

const task = (key: number, statusId: string, rank: string, completedAt: string | null = null): Task => ({
  id: `id-${key}`,
  key,
  title: `T-${key}`,
  statusId,
  priority: 0,
  rank,
  completedAt,
  createdAt: '2026-11-05T12:00:00.000Z',
})

const board = (tasks: Task[]) => ({ statuses: DEFAULT_STATUSES, tasks })

describe('placeAt: where a dropped card lands', () => {
  it('goes above the card it was dropped on, in the new status', () => {
    const b = board([task(1, 'todo', 'i'), task(2, 'doing', 'i'), task(3, 'doing', 'r')])
    const place = placeAt(b, 1, 'doing', 3)
    expect(place.statusId).toBe('doing')
    expect(place.rank > 'i' && place.rank < 'r').toBe(true)
  })

  it('goes to the bottom of the column when dropped on no card', () => {
    const b = board([task(1, 'todo', 'i'), task(2, 'doing', 'i')])
    const place = placeAt(b, 1, 'doing', null)
    expect(place.rank > 'i').toBe(true)
  })

  it('takes the first rank of an empty column', () => {
    expect(placeAt(board([task(1, 'todo', 'i')]), 1, 'done', null)).toEqual({ statusId: 'done', rank: 'i' })
  })

  it('moves up inside its own column without counting itself as a neighbour (C2)', () => {
    const b = board([task(1, 'todo', 'i'), task(2, 'todo', 'r')])
    const place = placeAt(b, 2, 'todo', 1)
    expect(place.rank < 'i').toBe(true)
  })

  it('moves down inside its own column, below the card under it', () => {
    const b = board([task(1, 'todo', 'i'), task(2, 'todo', 'r'), task(3, 'todo', 'v')])
    const place = placeAt(b, 1, 'todo', 3)
    expect(place.rank > 'r' && place.rank < 'v').toBe(true)
  })
})

describe('completionAfterMove (RN3)', () => {
  const NOW = '2026-11-05T15:00:00.000Z'
  const category = (id: string) => DEFAULT_STATUSES.find((status) => status.id === id)!.category

  it('stamps the instant on entering a completed or canceled status', () => {
    expect(completionAfterMove(null, category('done'), NOW)).toBe(NOW)
    expect(completionAfterMove(null, category('canceled'), NOW)).toBe(NOW)
  })

  it('clears it on leaving to an open status', () => {
    expect(completionAfterMove('2026-11-01T10:00:00.000Z', category('doing'), NOW)).toBeNull()
  })

  it('keeps the first stamp between two closed statuses, and nothing on open ones', () => {
    expect(completionAfterMove('2026-11-01T10:00:00.000Z', category('canceled'), NOW)).toBe('2026-11-01T10:00:00.000Z')
    expect(completionAfterMove(null, category('backlog'), NOW)).toBeNull()
  })
})
