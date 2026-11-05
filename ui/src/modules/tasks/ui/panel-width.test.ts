import { describe, expect, it } from 'vitest'
import { usePanelWidth } from './panel-width.js'

const memory = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  } as unknown as Storage & { data: Map<string, string> }
}

const broken = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
} as unknown as Storage

describe('usePanelWidth (card #44)', () => {
  it('opens with the default width on the first visit', () => {
    expect(usePanelWidth(() => memory()).width.value).toBe(576)
  })

  it('follows a drag without storing it, and stores it on release (C1)', () => {
    const storage = memory()
    const { width, follow, settle } = usePanelWidth(() => storage)
    follow(640)
    expect(width.value).toBe(640)
    expect(storage.data.size).toBe(0)
    settle()
    expect(storage.data.get('dailly.tasks.panelWidth')).toBe('640')
  })

  it('comes back with the width that was settled (C2)', () => {
    const storage = memory()
    const first = usePanelWidth(() => storage)
    first.follow(676)
    first.settle()
    expect(usePanelWidth(() => storage).width.value).toBe(676)
  })

  it('clamps what it follows, so the limit is what is stored (C3)', () => {
    const storage = memory()
    const { width, follow, settle } = usePanelWidth(() => storage)
    follow(1400)
    expect(width.value).toBe(960)
    settle()
    expect(storage.data.get('dailly.tasks.panelWidth')).toBe('960')
  })

  it('keeps the width until the reload when the storage throws (C5)', () => {
    const { width, follow, settle } = usePanelWidth(() => broken)
    expect(width.value).toBe(576)
    follow(676)
    expect(() => settle()).not.toThrow()
    expect(width.value).toBe(676)
    expect(usePanelWidth(() => broken).width.value).toBe(576)
  })
})
