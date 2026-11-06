import { SEED_STATUS_IDS, seedStatusesFor, type Task } from '@dailly/tasks-core'

const DEFAULT_STATUSES = seedStatusesFor('tasks', SEED_STATUS_IDS)
import { describe, expect, it } from 'vitest'
import { groupByStatus } from './list.js'

const task = (key: number, statusId: string): Task => ({
  id: `id-${key}`,
  boardId: 'tasks',
  key,
  keyPrefix: 'T',
  labelIds: [],
  title: `tarefa ${key}`,
  statusId,
  priority: 0,
  rank: 'i',
  completedAt: null,
  createdAt: '2026-11-05T12:00:00.000Z',
  body: '',
})

describe('groupByStatus', () => {
  it('gives every status a group, in order, even an empty one', () => {
    const groups = groupByStatus({ statuses: DEFAULT_STATUSES, tasks: [] })
    expect(groups.map((group) => [group.status.name, group.tasks.length])).toEqual([
      ['Backlog', 0],
      ['A fazer', 0],
      ['Fazendo', 0],
      ['Feito', 0],
      ['Cancelado', 0],
    ])
  })

  it('puts each task under its status and keeps the order the API sent', () => {
    const groups = groupByStatus({
      statuses: DEFAULT_STATUSES,
      tasks: [task(2, 'todo'), task(1, 'todo'), task(3, 'doing')],
    })
    expect(groups[1]?.tasks.map((t) => t.key)).toEqual([2, 1])
    expect(groups[2]?.tasks.map((t) => t.key)).toEqual([3])
  })
})
