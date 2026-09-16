/**
 * Instant + zone → calendar day, and back to instant bounds.
 *
 * **What is deliberately absent:** week, month and quadrimester. ADR 0007 fixed
 * their rules — week starts Monday (ISO-8601), quadrimester is jan–abr ·
 * mai–ago · set–dez, fixed thirds of the calendar and never sliding — but no
 * caller exists until the Analyse of Fase 4. They land with that caller, and
 * the rules are already decided so it is a transcription, not a decision.
 */
export type { CalendarDay, Instant, TimeZone } from './zone.js'
export {
  InvalidCalendarDayError,
  InvalidInstantError,
  UTC,
  UnknownTimeZoneError,
  dayBounds,
  dayOf,
  isSupportedTimeZone,
  rangeBounds,
} from './zone.js'
