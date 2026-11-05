import { atNoon, dayOf, type CalendarDay, type TimeZone } from '@dailly/periods'

/**
 * Which instant an entry happened at, given the day the person picked.
 *
 * This is policy, not time arithmetic — `@dailly/periods` provides the
 * conversions, the Daily Log decides what they mean:
 *
 * - **Today** is the moment you register. You are writing about now, and the
 *   card should say the hour you wrote it.
 * - **Any earlier day** is noon. The picker gave a *day*, not a time, and
 *   stamping it with the clock at the moment of writing would put a false hour
 *   on the card — the timeline would read "14:32" under yesterday and a person
 *   would take that for when the thing happened. Noon is the hour that claims
 *   nothing: it is neither the start nor the end of anything, and it sorts in
 *   the middle of a day rather than at either edge.
 */
export function occurredAtFor(day: CalendarDay, now: string, zone: TimeZone): string {
  return day === dayOf(now, zone) ? now : atNoon(day, zone)
}

/**
 * Whether a day may be logged to at all.
 *
 * Only today and earlier: a diary entry about a day that has not happened is
 * not a thing this product has an answer for. The rule lives here and in the
 * input's `max` — the domain does not enforce it, because the mvp never said
 * an Entry cannot be in the future and this is a decision about *this screen*.
 */
export function isLoggable(day: CalendarDay, now: string, zone: TimeZone): boolean {
  return day <= dayOf(now, zone)
}
