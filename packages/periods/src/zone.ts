/**
 * The single conversion point: instant + zone → calendar day.
 *
 * [ADR 0007](../../../docs/adrs/0007-api-local-e-tempo.md) split two questions
 * that look like one. `Clock` answers *"what instant is it now"*; this package
 * answers *"which calendar day does this instant belong to"*. Mixing them is
 * what spreads a timezone bug through a codebase — every caller that asks for
 * the time would also have to know the zone, and one of them eventually forgets.
 *
 * Both runtimes use this same code, which is the point: the day the timeline
 * groups by and the day the filter cuts by cannot disagree, because there is
 * only one implementation of "which day is this".
 *
 * There is no dependency here beyond `Intl`, which carries the IANA database in
 * both the browser and node. A date library would be a third opinion about
 * something the platform already knows.
 */

/** An IANA zone name, e.g. `America/Sao_Paulo`. `UTC` is the default (ADR 0007). */
export type TimeZone = string

/** A calendar day, `YYYY-MM-DD`. Not an instant: it has no time and no zone. */
export type CalendarDay = string

/** An instant, UTC ISO-8601 — the same string `Clock` produces. */
export type Instant = string

export const UTC: TimeZone = 'UTC'

export class UnknownTimeZoneError extends Error {
  override readonly name = 'UnknownTimeZoneError'
  constructor(zone: string) {
    super(`fuso desconhecido: ${zone}`)
  }
}

export class InvalidInstantError extends Error {
  override readonly name = 'InvalidInstantError'
  constructor(value: string) {
    super(`instante inválido: ${value}`)
  }
}

export class InvalidCalendarDayError extends Error {
  override readonly name = 'InvalidCalendarDayError'
  constructor(value: string) {
    super(`dia inválido, esperado YYYY-MM-DD: ${value}`)
  }
}

/**
 * Whether the platform knows this zone.
 *
 * Exists so the server can refuse a bad `DAILLY_TZ` at boot with a clear
 * message, instead of throwing on the first entry someone writes.
 */
export function isSupportedTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const formatterFor = (zone: TimeZone): Intl.DateTimeFormat => {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      // `h23` and not `hour12: false`: the latter can yield hour 24 in some
      // locales, which silently shifts a midnight into the next day.
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    throw new UnknownTimeZoneError(zone)
  }
}

interface WallTime {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/** What a wall clock in `zone` reads at this instant. */
function wallTimeAt(epochMs: number, zone: TimeZone): WallTime {
  const parts = formatterFor(zone).formatToParts(new Date(epochMs))
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((part) => part.type === type)
    if (!part) throw new UnknownTimeZoneError(zone)
    return Number(part.value)
  }
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  }
}

/** How far `zone` is from UTC at this instant, in milliseconds. */
function offsetAt(epochMs: number, zone: TimeZone): number {
  const wall = wallTimeAt(epochMs, zone)
  const asIfUTC = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
  return asIfUTC - epochMs
}

/**
 * The instant at which a wall clock in `zone` reads this local time.
 *
 * Two passes, because the offset depends on the instant we are trying to find.
 * The first guess uses the offset at the same wall time read as UTC; if the
 * real instant falls on the other side of a DST transition, the second pass
 * corrects it. Without this, an hour goes missing twice a year — in the zones
 * that still observe DST, which is why the tests use one that does.
 */
function instantOfWallTime(wall: WallTime, zone: TimeZone): number {
  const asIfUTC = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
  const firstGuess = asIfUTC - offsetAt(asIfUTC, zone)
  const corrected = asIfUTC - offsetAt(firstGuess, zone)
  return corrected
}

const parseInstant = (instant: Instant): number => {
  const epochMs = Date.parse(instant)
  if (Number.isNaN(epochMs)) throw new InvalidInstantError(instant)
  return epochMs
}

const parseDay = (day: CalendarDay): WallTime => {
  if (!DAY_PATTERN.test(day)) throw new InvalidCalendarDayError(day)
  const [year, month, dayOfMonth] = day.split('-').map(Number) as [number, number, number]
  if (month < 1 || month > 12 || dayOfMonth < 1 || dayOfMonth > 31) {
    throw new InvalidCalendarDayError(day)
  }
  return { year, month, day: dayOfMonth, hour: 0, minute: 0, second: 0 }
}

const pad = (value: number, width = 2): string => String(value).padStart(width, '0')

/**
 * Which calendar day this instant belongs to, in this zone.
 *
 * This is what the timeline groups by. An entry written at 21:00 in São Paulo
 * is stored as `00:00Z` of the next day; grouped in `America/Sao_Paulo` it
 * belongs to the day the person actually lived.
 */
export function dayOf(instant: Instant, zone: TimeZone): CalendarDay {
  const wall = wallTimeAt(parseInstant(instant), zone)
  return `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}`
}

/**
 * The instants that bound a calendar day in this zone.
 *
 * `endExclusive` and not "last instant": a half-open interval compares the same
 * way at any precision, so a store never has to decide whether
 * `23:59:59.999` is inside the day. The SQL is `>= start AND < endExclusive`.
 */
export function dayBounds(
  day: CalendarDay,
  zone: TimeZone,
): { start: Instant; endExclusive: Instant } {
  const wall = parseDay(day)
  const start = instantOfWallTime(wall, zone)
  const nextDay = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + 1))
  const endExclusive = instantOfWallTime(
    {
      year: nextDay.getUTCFullYear(),
      month: nextDay.getUTCMonth() + 1,
      day: nextDay.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    },
    zone,
  )
  return { start: new Date(start).toISOString(), endExclusive: new Date(endExclusive).toISOString() }
}

/**
 * Turn an inclusive range of calendar days into instant bounds.
 *
 * This is the conversion `EntryFilter` needs and deliberately does not do:
 * `from`/`to` are dates, the stored `occurredAt` is an instant, and only the
 * side that owns the zone can bridge them (ADR 0007 — the server).
 */
export function rangeBounds(
  range: { from?: CalendarDay; to?: CalendarDay },
  zone: TimeZone,
): { start?: Instant; endExclusive?: Instant } {
  return {
    ...(range.from ? { start: dayBounds(range.from, zone).start } : {}),
    ...(range.to ? { endExclusive: dayBounds(range.to, zone).endExclusive } : {}),
  }
}
