import { describe, expect, it } from 'vitest'
import { completionLabel } from './completion.js'

describe('completionLabel', () => {
  it('says the day of the stamp, in the configured zone', () => {
    // 01:30 UTC on the 6th is still the 5th in São Paulo.
    expect(completionLabel('2026-11-06T01:30:00.000Z', 'America/Sao_Paulo')).toBe('concluída em 05/11')
    expect(completionLabel('2026-11-06T01:30:00.000Z', 'UTC')).toBe('concluída em 06/11')
  })

  it('says nothing for an open task', () => {
    expect(completionLabel(null, 'UTC')).toBeNull()
  })
})
