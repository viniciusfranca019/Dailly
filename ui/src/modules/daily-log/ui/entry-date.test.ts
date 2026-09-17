import { describe, expect, it } from 'vitest'
import { timeOf } from '@dailly/periods'
import { isLoggable, occurredAtFor } from './entry-date.js'

const NOW = '2026-09-16T14:32:00.000Z'
const SAO_PAULO = 'America/Sao_Paulo'

describe('occurredAtFor', () => {
  it('is the moment of writing when the day is today', () => {
    expect(occurredAtFor('2026-09-16', NOW, 'UTC')).toBe(NOW)
  })

  it('is noon when the day is in the past', () => {
    // Not 14:32. The picker gave a day, and carrying the hour of writing onto
    // it would put a time on the card that nobody claimed.
    expect(occurredAtFor('2026-09-10', NOW, 'UTC')).toBe('2026-09-10T12:00:00.000Z')
  })

  it('reads as 12:00 on the card, in the configured zone', () => {
    // The visible contract: whatever instant this returns, the timeline must
    // label it noon for the person looking at it.
    const instant = occurredAtFor('2026-09-10', NOW, SAO_PAULO)

    expect(timeOf(instant, SAO_PAULO)).toBe('12:00')
    expect(instant).toBe('2026-09-10T15:00:00.000Z')
  })

  it('knows what today is in the configured zone, not in UTC', () => {
    // 02:00Z on the 17th is still the 16th in São Paulo, so "the 16th" is today
    // there and must keep the exact moment of writing.
    const lateNight = '2026-09-17T02:00:00.000Z'

    expect(occurredAtFor('2026-09-16', lateNight, SAO_PAULO)).toBe(lateNight)
    expect(occurredAtFor('2026-09-16', lateNight, 'UTC')).toBe('2026-09-16T12:00:00.000Z')
  })
})

describe('isLoggable', () => {
  it('accepts today and everything before it', () => {
    expect(isLoggable('2026-09-16', NOW, 'UTC')).toBe(true)
    expect(isLoggable('2026-09-15', NOW, 'UTC')).toBe(true)
    expect(isLoggable('2020-01-01', NOW, 'UTC')).toBe(true)
  })

  it('refuses a day that has not happened', () => {
    expect(isLoggable('2026-09-17', NOW, 'UTC')).toBe(false)
  })

  it('judges "today" in the configured zone', () => {
    // In São Paulo it is still the 16th, so the 17th is tomorrow and refused —
    // while in UTC the same instant makes the 17th today.
    const lateNight = '2026-09-17T02:00:00.000Z'

    expect(isLoggable('2026-09-17', lateNight, SAO_PAULO)).toBe(false)
    expect(isLoggable('2026-09-17', lateNight, 'UTC')).toBe(true)
  })
})
