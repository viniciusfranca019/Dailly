import { describe, expect, it } from 'vitest'
import { commentStamp } from './comment-stamp.js'

describe('commentStamp (#45 C1)', () => {
  it('reads "dd/mm hh:mm" in the configured zone', () => {
    expect(commentStamp('2026-11-05T17:32:00.000Z', 'America/Sao_Paulo')).toBe('05/11 14:32')
  })

  it('takes the day of the zone, not of UTC', () => {
    expect(commentStamp('2026-11-06T01:30:00.000Z', 'America/Sao_Paulo')).toBe('05/11 22:30')
  })
})
