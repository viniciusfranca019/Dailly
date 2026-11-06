import { describe, expect, it } from 'vitest'
import { matchesTitle, searchKey } from './search.js'

describe('the search text (#47)', () => {
  it('reads a key in any case, and nothing else as a key', () => {
    expect(searchKey('casa-3')).toEqual({ prefix: 'CASA', key: 3 })
    expect(searchKey('  T-12 ')).toEqual({ prefix: 'T', key: 12 })
    expect(searchKey('café')).toBeNull()
  })

  it('matches part of the title, folding ASCII case only, as SQLite LIKE does', () => {
    expect(matchesTitle('Comprar café', 'CAFÉ')).toBe(false)
    expect(matchesTitle('Comprar café', 'Caf')).toBe(true)
    expect(matchesTitle('Café da manhã de domingo', 'café')).toBe(true)
    expect(matchesTitle('Comprar café', 'cafe')).toBe(false)
    expect(matchesTitle('100% feito', '%')).toBe(true)
    expect(matchesTitle('abc', 'a_c')).toBe(false)
  })
})
