import { describe, expect, it } from 'vitest'
import { clampPanelWidth, PANEL_WIDTH, readPanelWidth } from './width.js'

describe('clampPanelWidth (card #44)', () => {
  it('keeps a width inside the limits as it is (C1)', () => {
    expect(clampPanelWidth(676)).toBe(676)
  })

  it('stops at the minimum and at the maximum (C3)', () => {
    expect(clampPanelWidth(200)).toBe(PANEL_WIDTH.min)
    expect(clampPanelWidth(1400)).toBe(PANEL_WIDTH.max)
    expect(PANEL_WIDTH).toEqual({ min: 360, max: 960, initial: 576 })
  })

  it('rounds a fractional pointer position to whole pixels', () => {
    expect(clampPanelWidth(676.6)).toBe(677)
  })
})

describe('readPanelWidth', () => {
  it('reads the default when nothing was stored', () => {
    expect(readPanelWidth(null)).toBe(576)
  })

  it('reads a stored width back', () => {
    expect(readPanelWidth('676')).toBe(676)
  })

  it('reads the default for a value that is not a number', () => {
    expect(readPanelWidth('wide')).toBe(576)
    expect(readPanelWidth('')).toBe(576)
  })

  it('reads the nearest limit for a stored value out of range', () => {
    expect(readPanelWidth('10')).toBe(360)
    expect(readPanelWidth('5000')).toBe(960)
  })
})
