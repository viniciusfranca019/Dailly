import { describe, expect, it } from 'vitest'
import { TitleRequiredError, formatKey, normalizeTitle, parseKey } from './task.js'

describe('the task key', () => {
  it('reads as T-<n>', () => {
    expect(formatKey(3)).toBe('T-3')
  })

  it('parses back only the shape it writes', () => {
    expect(parseKey('T-12')).toBe(12)
    expect(parseKey('t-12')).toBeNull()
    expect(parseKey('T-0')).toBeNull()
    expect(parseKey('T-1a')).toBeNull()
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
