import type { Entry } from '@dailly/domain'
import { dayOf, type CalendarDay, type TimeZone } from '@dailly/periods'

/**
 * The timeline, as data.
 *
 * Pure and outside the component on purpose: grouping by day is where a
 * timezone bug would hide, and a bug that can only be reproduced by mounting a
 * component is a bug nobody reproduces.
 */

export interface DayGroup {
  readonly day: CalendarDay
  readonly entries: readonly Entry[]
}

/**
 * Group entries into days, newest day first, newest entry first inside a day.
 *
 * The day is computed with `@dailly/periods` — the same code the server filters
 * with — because "which day is this instant" must have exactly one answer in
 * this product. The input is assumed already ordered by the repository, whose
 * contract promises newest first; grouping preserves that rather than
 * re-sorting, so a disagreement surfaces as a visible bug instead of being
 * papered over here.
 */
export function groupByDay(entries: readonly Entry[], zone: TimeZone): DayGroup[] {
  const groups = new Map<CalendarDay, Entry[]>()

  for (const entry of entries) {
    const day = dayOf(entry.occurredAt, zone)
    const existing = groups.get(day)
    if (existing) existing.push(entry)
    else groups.set(day, [entry])
  }

  return [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([day, entries]) => ({ day, entries }))
}

/** `2026-07-24` → `24 de julho de 2026`, in the app's language. */
export function formatDay(day: CalendarDay): string {
  const [year, month, dayOfMonth] = day.split('-').map(Number) as [number, number, number]
  // A calendar day has no time and no zone, so it is formatted from its parts
  // rather than parsed into a Date — which would drag a zone back in through
  // the back door.
  const MONTHS = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ]
  return `${dayOfMonth} de ${MONTHS[month - 1]} de ${year}`
}

/** The first line of a body, for the timeline's one-line summary. */
export function titleOf(body: string): string {
  const firstLine = body.split('\n').find((line) => line.trim() !== '') ?? ''
  // Strip the markdown marker so the timeline shows text, not syntax.
  // `[]` and not `[ ]`: normalization strips the space inside an unchecked
  // todo, so the canonical form has nothing between the brackets.
  return firstLine.replace(/^(#{1,6}\s+|-\s+|\d+\.\s+|\[[ x]?\]\s*)/, '').trim() || 'sem título'
}
