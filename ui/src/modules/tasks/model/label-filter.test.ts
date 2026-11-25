import { SEED_STATUS_IDS, seedStatusesFor, type Task } from '@dailly/tasks-core'
import { describe, expect, it } from 'vitest'
import { filterByLabels } from './label-filter.js'

const STATUSES = seedStatusesFor('tasks', SEED_STATUS_IDS)

const task = (key: number, labelIds: string[]): Task => ({
  id: `id-${key}`,
  boardId: 'tasks',
  key,
  keyPrefix: 'T',
  labelIds,
  title: `tarefa ${key}`,
  statusId: 'todo',
  priority: 0,
  rank: 'i',
  completedAt: null,
  createdAt: '2026-11-05T12:00:00.000Z',
  body: '',
})

/** T-1 with bug, T-2 with ui, T-3 with none: the board the scenarios share. */
const board = { statuses: STATUSES, tasks: [task(1, ['bug']), task(2, ['ui']), task(3, [])] }
const keys = (labelIds: string[]) => filterByLabels(board, labelIds).tasks.map((t) => t.key)

describe('filterByLabels', () => {
  it('C1: keeps only the tasks with the label, and every status', () => {
    expect(keys(['bug'])).toEqual([1])
    expect(filterByLabels(board, ['bug']).statuses).toBe(STATUSES)
  })

  it('C2: labels toggled on add up (OR), in the order the API sent', () => {
    expect(keys(['ui', 'bug'])).toEqual([1, 2])
  })

  it('C3: no label on is the whole board, untouched', () => {
    expect(filterByLabels(board, [])).toBe(board)
  })

  it('C4: a label no task carries leaves no task', () => {
    expect(keys(['docs'])).toEqual([])
  })
})
