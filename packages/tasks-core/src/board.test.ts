import { describe, expect, it } from 'vitest'
import { InvalidPrefixError, NameRequiredError, normalizeBoardName, normalizePrefix } from './board.js'

describe('the board prefix (RN9, J5.1a)', () => {
  it('takes letters A to Z and digits, up to six', () => {
    expect(normalizePrefix('CASA')).toBe('CASA')
    expect(normalizePrefix('Q4')).toBe('Q4')
    expect(normalizePrefix('ABCDEF')).toBe('ABCDEF')
  })

  it.each([
    ['', 'o prefixo é obrigatório'],
    ['   ', 'o prefixo é obrigatório'],
    ['CA-SA', 'o prefixo usa só letras de A a Z e números'],
    ['casa', 'o prefixo usa só letras de A a Z e números'],
    ['CASÃ', 'o prefixo usa só letras de A a Z e números'],
    ['CASINHA', 'o prefixo tem no máximo 6 caracteres'],
  ])('refuses %j with "%s"', (prefix, message) => {
    expect(() => normalizePrefix(prefix)).toThrow(InvalidPrefixError)
    expect(() => normalizePrefix(prefix)).toThrow(message)
  })
})

describe('the board name (J5.1b)', () => {
  it('is trimmed and required', () => {
    expect(normalizeBoardName('  Casa ')).toBe('Casa')
    expect(() => normalizeBoardName('  ')).toThrow(NameRequiredError)
    expect(() => normalizeBoardName('')).toThrow('o nome é obrigatório')
  })
})
