import { describe, expect, it } from 'vitest'
import { LABEL_COLORS, findByName, isLabelColor, labelKey, nextColor, normalizeLabelName } from './label.js'

describe('label names', () => {
  it('C3: a name that is empty once trimmed is no name', () => {
    expect(normalizeLabelName('   ')).toBeNull()
    expect(normalizeLabelName('  saúde ')).toBe('saúde')
  })

  it('C4: the key ignores case, accents included (RN1)', () => {
    expect(labelKey('Saúde')).toBe(labelKey('SAÚDE'))
    expect(labelKey('Trabalho')).toBe(labelKey('trabalho'))
  })

  it('C4: finds an existing label whatever the case', () => {
    const labels = [{ id: 'a', name: 'Trabalho', color: 'blue' as const }]
    expect(findByName(labels, ' trabalho ')?.id).toBe('a')
    expect(findByName(labels, 'casa')).toBeUndefined()
  })
})

describe('label colors', () => {
  it('C2: a new label takes the first palette color not in use, then cycles', () => {
    expect(nextColor([])).toBe(LABEL_COLORS[0])
    expect(nextColor([{ color: LABEL_COLORS[0] }])).toBe(LABEL_COLORS[1])
    expect(nextColor(LABEL_COLORS.map((color) => ({ color })))).toBe(LABEL_COLORS[0])
  })

  it('accepts only palette colors', () => {
    expect(isLabelColor('blue')).toBe(true)
    expect(isLabelColor('#ff0000')).toBe(false)
  })
})
