import { describe, expect, it } from 'vitest'
import { useLastBoard } from './board-choice.js'

const memory = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  } as unknown as Storage & { data: Map<string, string> }
}

const boards = [
  { id: 'tasks', name: 'Tasks', prefix: 'T' },
  { id: 'casa', name: 'Casa', prefix: 'CASA' },
]

describe('useLastBoard (C5)', () => {
  it('opens the first board on the first visit', () => {
    expect(useLastBoard(() => memory()).pick(boards)).toBe('tasks')
  })

  it('comes back to the board that was chosen, under dailly.tasks.board', () => {
    const storage = memory()
    useLastBoard(() => storage).remember('casa')
    expect(storage.data.get('dailly.tasks.board')).toBe('casa')
    expect(useLastBoard(() => storage).pick(boards)).toBe('casa')
  })

  it('falls back to the first board on an id that no longer exists, or a storage that throws', () => {
    expect(useLastBoard(() => memory({ 'dailly.tasks.board': 'gone' })).pick(boards)).toBe('tasks')
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    } as unknown as Storage
    const choice = useLastBoard(() => broken)
    expect(choice.pick(boards)).toBe('tasks')
    expect(() => choice.remember('casa')).not.toThrow()
  })

  it('has nothing to pick with no board', () => {
    expect(useLastBoard(() => memory()).pick([])).toBeNull()
  })
})
