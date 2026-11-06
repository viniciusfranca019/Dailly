import { describe, expect, it } from 'vitest'
import { onOpenRequest, requestOpen, takeOpen } from './open-request.js'

describe('the open request (#47 C7)', () => {
  it('is taken once, and tells who listens', () => {
    let heard = 0
    const stop = onOpenRequest(() => (heard += 1))
    requestOpen({ boardId: 'casa', prefix: 'CASA', key: 3 })

    expect(heard).toBe(1)
    expect(takeOpen()).toEqual({ boardId: 'casa', prefix: 'CASA', key: 3 })
    expect(takeOpen()).toBeNull()
    stop()
    requestOpen({ boardId: 'tasks', prefix: 'T', key: 1 })
    expect(heard).toBe(1)
    takeOpen()
  })
})
