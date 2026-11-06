import { describe, expect, it } from 'vitest'
import { TitleRequiredError, formatKey, normalizeTitle, parseKey } from './task.js'

describe('the task key (RN5)', () => {
  it('reads as <PREFIX>-<n>', () => {
    expect(formatKey('T', 3)).toBe('T-3')
    expect(formatKey('CASA', 12)).toBe('CASA-12')
  })

  it('parses back only the shape it writes', () => {
    expect(parseKey('T-12')).toEqual({ prefix: 'T', key: 12 })
    expect(parseKey('CASA-3')).toEqual({ prefix: 'CASA', key: 3 })
    expect(parseKey('Q4-1')).toEqual({ prefix: 'Q4', key: 1 })
    expect(parseKey('t-12')).toBeNull()
    expect(parseKey('T-0')).toBeNull()
    expect(parseKey('T-1a')).toBeNull()
    expect(parseKey('CASINHA-1')).toBeNull()
    expect(parseKey('-1')).toBeNull()
    expect(parseKey('12')).toBeNull()
  })
})

describe('the title', () => {
  it('is trimmed', () => {
    expect(normalizeTitle('  Comprar café ')).toBe('Comprar café')
  })

  it('is required, and only spaces count as empty (C5)', () => {
    expect(() => normalizeTitle('')).toThrow(TitleRequiredError)
    expect(() => normalizeTitle('   ')).toThrow('o título é obrigatório')
  })
})
