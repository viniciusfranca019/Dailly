import { describe, expect, it } from 'vitest'
import {
  InvalidCalendarDayError,
  atNoon,
  InvalidInstantError,
  UTC,
  UnknownTimeZoneError,
  dayBounds,
  dayOf,
  isSupportedTimeZone,
  rangeBounds,
  timeOf,
} from './zone.js'

const SAO_PAULO = 'America/Sao_Paulo'
/** New York still observes DST; São Paulo has not since 2019. */
const NEW_YORK = 'America/New_York'

describe('dayOf', () => {
  it('is the UTC date when the zone is UTC', () => {
    expect(dayOf('2026-07-24T10:00:00.000Z', UTC)).toBe('2026-07-24')
  })

  it('puts a late-evening instant on the day the person actually lived', () => {
    // 21:00 in São Paulo is already tomorrow in UTC. The whole reason this
    // package exists: the timeline must group by the former, not the latter.
    expect(dayOf('2026-07-25T00:00:00.000Z', SAO_PAULO)).toBe('2026-07-24')
    expect(dayOf('2026-07-25T00:00:00.000Z', UTC)).toBe('2026-07-25')
  })

  it('handles the first instant of a day in a negative-offset zone', () => {
    expect(dayOf('2026-07-24T03:00:00.000Z', SAO_PAULO)).toBe('2026-07-24')
    expect(dayOf('2026-07-24T02:59:59.999Z', SAO_PAULO)).toBe('2026-07-23')
  })

  it('rejects an instant it cannot parse', () => {
    expect(() => dayOf('ontem', UTC)).toThrow(InvalidInstantError)
  })

  it('rejects a zone the platform does not know', () => {
    expect(() => dayOf('2026-07-24T10:00:00.000Z', 'Mars/Olympus')).toThrow(UnknownTimeZoneError)
  })
})

describe('dayBounds', () => {
  it('spans midnight to midnight in UTC', () => {
    expect(dayBounds('2026-07-24', UTC)).toEqual({
      start: '2026-07-24T00:00:00.000Z',
      endExclusive: '2026-07-25T00:00:00.000Z',
    })
  })

  it('shifts by the zone offset', () => {
    // São Paulo is UTC-3 year round since 2019.
    expect(dayBounds('2026-07-24', SAO_PAULO)).toEqual({
      start: '2026-07-24T03:00:00.000Z',
      endExclusive: '2026-07-25T03:00:00.000Z',
    })
  })

  it('crosses a month boundary', () => {
    expect(dayBounds('2026-07-31', UTC).endExclusive).toBe('2026-08-01T00:00:00.000Z')
  })

  it('crosses a year boundary', () => {
    expect(dayBounds('2026-12-31', UTC).endExclusive).toBe('2027-01-01T00:00:00.000Z')
  })

  it('is 25 hours long on the day DST ends', () => {
    // 2026-11-01 in New York: the clocks go back, so the day really is longer.
    // A naive "add 24 hours" implementation returns the wrong end and silently
    // drops the last hour of entries.
    const { start, endExclusive } = dayBounds('2026-11-01', NEW_YORK)
    const hours = (Date.parse(endExclusive) - Date.parse(start)) / 3_600_000
    expect(hours).toBe(25)
  })

  it('is 23 hours long on the day DST begins', () => {
    const { start, endExclusive } = dayBounds('2026-03-08', NEW_YORK)
    const hours = (Date.parse(endExclusive) - Date.parse(start)) / 3_600_000
    expect(hours).toBe(23)
  })

  it('agrees with dayOf at both edges', () => {
    // The two functions are the same idea read in opposite directions, so they
    // have to meet: the first instant of a day belongs to it, and the
    // exclusive end belongs to the next one.
    for (const zone of [UTC, SAO_PAULO, NEW_YORK]) {
      const { start, endExclusive } = dayBounds('2026-11-01', zone)
      expect(dayOf(start, zone)).toBe('2026-11-01')
      expect(dayOf(new Date(Date.parse(start) - 1).toISOString(), zone)).toBe('2026-10-31')
      expect(dayOf(endExclusive, zone)).toBe('2026-11-02')
      expect(dayOf(new Date(Date.parse(endExclusive) - 1).toISOString(), zone)).toBe('2026-11-01')
    }
  })

  it('rejects something that is not a calendar day', () => {
    expect(() => dayBounds('2026-07-24T00:00:00Z', UTC)).toThrow(InvalidCalendarDayError)
    expect(() => dayBounds('24/07/2026', UTC)).toThrow(InvalidCalendarDayError)
    expect(() => dayBounds('2026-13-01', UTC)).toThrow(InvalidCalendarDayError)
  })
})

describe('rangeBounds', () => {
  it('turns an inclusive day range into a half-open instant range', () => {
    // The mvp filter "de 2026-07-01 a 2026-07-31" must include everything that
    // happened on the 31st, which is why the end is the start of the 1st of
    // August rather than some instant inside the 31st.
    expect(rangeBounds({ from: '2026-07-01', to: '2026-07-31' }, UTC)).toEqual({
      start: '2026-07-01T00:00:00.000Z',
      endExclusive: '2026-08-01T00:00:00.000Z',
    })
  })

  it('leaves out the bound that was not asked for', () => {
    expect(rangeBounds({ from: '2026-07-01' }, UTC)).toEqual({
      start: '2026-07-01T00:00:00.000Z',
    })
    expect(rangeBounds({ to: '2026-07-31' }, UTC)).toEqual({
      endExclusive: '2026-08-01T00:00:00.000Z',
    })
    expect(rangeBounds({}, UTC)).toEqual({})
  })

  it('applies the zone to both ends', () => {
    expect(rangeBounds({ from: '2026-07-01', to: '2026-07-31' }, SAO_PAULO)).toEqual({
      start: '2026-07-01T03:00:00.000Z',
      endExclusive: '2026-08-01T03:00:00.000Z',
    })
  })
})

describe('isSupportedTimeZone', () => {
  it('accepts what the platform knows and refuses what it does not', () => {
    // The server calls this at boot so a typo in DAILLY_TZ fails there, with a
    // message, instead of on the first entry someone writes.
    expect(isSupportedTimeZone(UTC)).toBe(true)
    expect(isSupportedTimeZone(SAO_PAULO)).toBe(true)
    expect(isSupportedTimeZone('Mars/Olympus')).toBe(false)
  })
})

describe('timeOf', () => {
  it('reads the clock on the wall, in 24 hours', () => {
    expect(timeOf('2026-07-24T18:15:00.000Z', UTC)).toBe('18:15')
  })

  it('shifts with the zone, like everything else here', () => {
    // The timeline groups by day in the configured zone; labelling the same
    // entry with a UTC time would put "21:00" under the heading for a day that
    // ended three hours earlier.
    expect(timeOf('2026-07-25T00:00:00.000Z', SAO_PAULO)).toBe('21:00')
  })

  it('pads both halves, so a column of times lines up', () => {
    expect(timeOf('2026-07-24T09:05:00.000Z', UTC)).toBe('09:05')
    expect(timeOf('2026-07-24T00:00:00.000Z', UTC)).toBe('00:00')
  })

  it('says 00:00 at midnight rather than 24:00', () => {
    // The `hourCycle: h23` choice, made visible: the other cycle would push
    // midnight into the previous day's last minute.
    expect(timeOf('2026-07-24T03:00:00.000Z', SAO_PAULO)).toBe('00:00')
  })

  it('refuses what it cannot read', () => {
    expect(() => timeOf('agora', UTC)).toThrow(InvalidInstantError)
  })
})

describe('atNoon', () => {
  it('is midday on the wall clock, in UTC', () => {
    expect(atNoon('2026-07-24', UTC)).toBe('2026-07-24T12:00:00.000Z')
  })

  it('shifts with the zone', () => {
    // Noon in São Paulo is 15:00Z year round.
    expect(atNoon('2026-07-24', SAO_PAULO)).toBe('2026-07-24T15:00:00.000Z')
  })

  it('stays at noon on a day that loses an hour', () => {
    // The reason this is a wall-clock computation and not "start of day plus
    // twelve hours": on 2026-03-08 in New York those are different instants,
    // and only one of them reads as 12:00 to the person looking at it.
    expect(timeOf(atNoon('2026-03-08', NEW_YORK), NEW_YORK)).toBe('12:00')
    expect(timeOf(atNoon('2026-11-01', NEW_YORK), NEW_YORK)).toBe('12:00')
  })

  it('belongs to the day it names', () => {
    for (const zone of [UTC, SAO_PAULO, NEW_YORK]) {
      expect(dayOf(atNoon('2026-07-24', zone), zone)).toBe('2026-07-24')
    }
  })

  it('refuses something that is not a calendar day', () => {
    expect(() => atNoon('24/07/2026', UTC)).toThrow(InvalidCalendarDayError)
  })
})
