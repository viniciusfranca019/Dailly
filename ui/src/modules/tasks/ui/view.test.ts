import { describe, expect, it } from 'vitest'
import { useTasksView } from './view.js'

const memory = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  } as unknown as Storage & { data: Map<string, string> }
}

describe('useTasksView', () => {
  it('opens the board on the first visit (C6)', () => {
    expect(useTasksView(() => memory()).view.value).toBe('board')
  })

  it('comes back to the view that was chosen', () => {
    const storage = memory()
    useTasksView(() => storage).choose('list')
    expect(useTasksView(() => storage).view.value).toBe('list')
  })

  it('falls back to the board on an unknown value or a storage that throws', () => {
    expect(useTasksView(() => memory({ 'dailly.tasks.view': 'gantt' })).view.value).toBe('board')
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } } as unknown as Storage
    const { view, choose } = useTasksView(() => broken)
    expect(view.value).toBe('board')
    choose('list')
    expect(view.value).toBe('list')
  })
})
