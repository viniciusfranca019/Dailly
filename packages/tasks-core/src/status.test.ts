import { describe, expect, it } from 'vitest'
import {
  InvalidCategoryError,
  InvalidColorError,
  STATUS_SEED,
  StatusNameTakenError,
  normalizeStatusName,
  orderStatuses,
  parseNewStatus,
  seedStatusesFor,
} from './status.js'

describe('the status seed (RN11)', () => {
  it('is five statuses, one per category, each with its Linear color', () => {
    expect(STATUS_SEED.map((seed) => [seed.name, seed.category, seed.color])).toEqual([
      ['Backlog', 'backlog', 'gray'],
      ['A fazer', 'unstarted', 'gray'],
      ['Fazendo', 'started', 'yellow'],
      ['Feito', 'completed', 'blue'],
      ['Cancelado', 'canceled', 'gray'],
    ])
  })

  it('takes the ids it is given, for the board it is given, in order', () => {
    const seeded = seedStatusesFor('casa', ['a', 'b', 'c', 'd', 'e'])
    expect(seeded.map((status) => [status.id, status.boardId, status.position])).toEqual([
      ['a', 'casa', 0],
      ['b', 'casa', 1],
      ['c', 'casa', 2],
      ['d', 'casa', 3],
      ['e', 'casa', 4],
    ])
  })
})

describe('orderStatuses (RN11)', () => {
  it('orders by the fixed order of the categories, then by creation, and numbers the position', () => {
    const ordered = orderStatuses([
      { id: 'done', boardId: 'b', name: 'Feito', category: 'completed', color: 'blue', createdOrder: 3 },
      { id: 'review', boardId: 'b', name: 'Revisão', category: 'started', color: 'purple', createdOrder: 5 },
      { id: 'doing', boardId: 'b', name: 'Fazendo', category: 'started', color: 'yellow', createdOrder: 2 },
      { id: 'todo', boardId: 'b', name: 'A fazer', category: 'unstarted', color: 'gray', createdOrder: 1 },
    ])
    expect(ordered.map((status) => [status.name, status.position])).toEqual([
      ['A fazer', 0],
      ['Fazendo', 1],
      ['Revisão', 2],
      ['Feito', 3],
    ])
    expect(ordered[0]).not.toHaveProperty('createdOrder')
  })
})

describe('a new status (J6.1a)', () => {
  it('takes a trimmed name, a known category and a color of the palette', () => {
    expect(parseNewStatus({ name: ' Revisão ', category: 'started', color: 'purple' })).toEqual({
      name: 'Revisão',
      category: 'started',
      color: 'purple',
    })
  })

  it('refuses an empty name, an unknown category or a color outside the palette', () => {
    expect(() => normalizeStatusName('  ')).toThrow('o nome é obrigatório')
    expect(() => parseNewStatus({ name: 'x', category: 'review', color: 'purple' })).toThrow(InvalidCategoryError)
    expect(() => parseNewStatus({ name: 'x', category: 'started', color: 'magenta' })).toThrow(InvalidColorError)
  })

  it('says which name is taken in the board', () => {
    expect(new StatusNameTakenError('Feito').message).toBe('já existe um status "Feito" neste board')
  })
})
