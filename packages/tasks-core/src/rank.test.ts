import { describe, expect, it } from 'vitest'
import { rankBetween } from './rank.js'

describe('rankBetween', () => {
  it('gives a first rank when the column is empty', () => {
    expect(rankBetween(undefined, undefined)).toMatch(/^[0-9a-z]+$/)
  })

  it('sorts strictly between its neighbours', () => {
    const a = rankBetween(undefined, undefined)
    const b = rankBetween(a, undefined)
    const mid = rankBetween(a, b)
    expect(a < mid && mid < b).toBe(true)
  })

  it('keeps going above the top, which is where a new task lands', () => {
    // Fifty captures in a row on the same column: each one goes above the last.
    let top = rankBetween(undefined, undefined)
    for (let i = 0; i < 50; i += 1) {
      const above = rankBetween(undefined, top)
      expect(above < top).toBe(true)
      expect(above.endsWith('0')).toBe(false)
      top = above
    }
  })

  it('keeps finding room between two neighbours that keep getting closer', () => {
    let low = rankBetween(undefined, undefined)
    const high = rankBetween(low, undefined)
    for (let i = 0; i < 50; i += 1) {
      const mid = rankBetween(low, high)
      expect(low < mid && mid < high).toBe(true)
      low = mid
    }
  })

  it('refuses neighbours out of order, which would be a bug in the caller', () => {
    expect(() => rankBetween('b', 'a')).toThrow(RangeError)
    expect(() => rankBetween('a', 'a')).toThrow(RangeError)
  })
})
