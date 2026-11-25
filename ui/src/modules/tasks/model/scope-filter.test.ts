import { SEED_STATUS_IDS, seedStatusesFor, type FocusBoard, type ProgramWithTasks, type Task } from '@dailly/tasks-core'
import { describe, expect, it } from 'vitest'
import { filterByFocus, filterByPrograms } from './scope-filter.js'

const STATUSES = seedStatusesFor('tasks', SEED_STATUS_IDS)

const task = (key: number, statusId = 'todo'): Task => ({
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
  createdAt: '2026-11-25T12:00:00.000Z',
  body: '',
})

const program = (id: string, keys: string[], focus: ProgramWithTasks['focus'] = null): ProgramWithTasks => ({
  id,
  name: id,
  objective: '',
  windowStart: null,
  windowEnd: null,
  exitWhen: '',
  focus,
  tasks: keys.map((key) => ({ key, title: key, status: 'A fazer', boardId: 'tasks' })),
})

/**
 * T-1 and T-2 (done) in "alfa" at P0, T-3 in "beta" out of focus, T-4 alone
 * at P0, T-5 (canceled) alone at P0, T-6 alone at P1 and T-7 in nothing.
 */
const board = {
  statuses: STATUSES,
  tasks: [task(1), task(2, 'done'), task(3), task(4), task(5, 'canceled'), task(6, 'doing'), task(7)],
}
const PROGRAMS = [program('alfa', ['T-1', 'T-2'], 'P0'), program('beta', ['T-3'])]
const FOCUS: FocusBoard = {
  P0: [
    { kind: 'program', id: 'alfa', name: 'alfa' },
    { kind: 'task', key: 'T-4', title: 'tarefa 4' },
    { kind: 'task', key: 'T-5', title: 'tarefa 5' },
  ],
  P1: [{ kind: 'task', key: 'T-6', title: 'tarefa 6' }],
  P2: [],
}

const keys = (cut: { tasks: readonly Task[] }) => cut.tasks.map((t) => t.key)

describe('filterByPrograms', () => {
  it('C1: keeps the tasks of the program, with every status, and every column', () => {
    const cut = filterByPrograms(board, PROGRAMS, ['alfa'])
    expect(keys(cut)).toEqual([1, 2])
    expect(cut.statuses).toBe(STATUSES)
  })

  it('C1: two programs add up (OR)', () => {
    expect(keys(filterByPrograms(board, PROGRAMS, ['alfa', 'beta']))).toEqual([1, 2, 3])
  })

  it('matches the whole key, so a task of another board with the same number stays out', () => {
    const other = { statuses: STATUSES, tasks: [{ ...task(1), keyPrefix: 'LAB' }] }
    expect(keys(filterByPrograms(other, PROGRAMS, ['alfa']))).toEqual([])
  })

  it('with no program on, the board is untouched', () => {
    expect(filterByPrograms(board, PROGRAMS, [])).toBe(board)
  })
})

describe('filterByFocus', () => {
  it('C2: P0 keeps the tasks of its programs and its loose tasks, but never a completed or canceled one', () => {
    expect(keys(filterByFocus(board, PROGRAMS, FOCUS, ['P0']))).toEqual([1, 4])
  })

  it('C2: levels add up (OR)', () => {
    expect(keys(filterByFocus(board, PROGRAMS, FOCUS, ['P0', 'P1']))).toEqual([1, 4, 6])
  })

  it('C2: reads the category, not the name, so a renamed "Feito" still hides', () => {
    const renamed = { ...board, statuses: STATUSES.map((s) => (s.id === 'done' ? { ...s, name: 'Entregue' } : s)) }
    expect(keys(filterByFocus(renamed, PROGRAMS, FOCUS, ['P0']))).toEqual([1, 4])
  })

  it('C5: an empty level keeps nothing', () => {
    expect(keys(filterByFocus(board, PROGRAMS, FOCUS, ['P2']))).toEqual([])
  })

  it('with no level on, the board is untouched, done tasks included', () => {
    expect(filterByFocus(board, PROGRAMS, FOCUS, [])).toBe(board)
  })
})

describe('C3: the cuts compose (AND between filters)', () => {
  it('alfa and P0 keep only what passes both', () => {
    const cut = filterByFocus(filterByPrograms(board, PROGRAMS, ['beta', 'alfa']), PROGRAMS, FOCUS, ['P0'])
    expect(keys(cut)).toEqual([1])
  })
})
