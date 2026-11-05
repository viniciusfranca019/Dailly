import { describe, expect, it } from 'vitest'
import { formatPropertyValue, normalizePropertyKey, parsePropertyValue, PROPERTY_TYPE_NAMES } from './property.js'

describe('property keys', () => {
  it('C5: a key that is empty once trimmed is no key', () => {
    expect(normalizePropertyKey('  ')).toBeNull()
    expect(normalizePropertyKey(' humor ')).toBe('humor')
  })
})

describe('property values', () => {
  it('C1: text is kept as typed, trimmed', () => {
    expect(parsePropertyValue('humor', 'text', ' bom ')).toEqual({ value: 'bom' })
  })

  it('C4: a number must be a number', () => {
    expect(parsePropertyValue('horas', 'number', '7,5')).toEqual({ value: 7.5 })
    expect(parsePropertyValue('horas', 'number', 'abc')).toEqual({ error: 'horas espera um número' })
    expect(parsePropertyValue('horas', 'number', '')).toEqual({ error: 'horas espera um número' })
  })

  it('C3: yes or no', () => {
    expect(parsePropertyValue('dormiu', 'boolean', 'sim')).toEqual({ value: true })
    expect(parsePropertyValue('dormiu', 'boolean', 'não')).toEqual({ value: false })
    expect(parsePropertyValue('dormiu', 'boolean', 'talvez')).toEqual({ error: 'dormiu espera sim ou não' })
  })

  it('an empty text is no value', () => {
    expect(parsePropertyValue('humor', 'text', '  ')).toEqual({ error: 'humor precisa de um valor' })
  })

  it('formats a value the way the timeline shows it', () => {
    expect(formatPropertyValue(true)).toBe('sim')
    expect(formatPropertyValue(false)).toBe('não')
    expect(formatPropertyValue(7.5)).toBe('7,5')
    expect(formatPropertyValue('bom')).toBe('bom')
  })

  it('C2: names each type as the suggestion shows it', () => {
    expect(PROPERTY_TYPE_NAMES).toEqual({ text: 'texto', number: 'número', boolean: 'sim/não' })
  })
})
