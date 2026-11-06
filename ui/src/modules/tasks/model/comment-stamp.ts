import { dayOf, timeOf, type TimeZone } from '@dailly/periods'

/**
 * "05/11 14:32": when a comment was sent, in the configured zone (card #45,
 * C1), the day and the time from the same conversion, so a comment at 22:30
 * in São Paulo is not dated the next day.
 */
export function commentStamp(createdAt: string, zone: TimeZone): string {
  const [, month, day] = dayOf(createdAt, zone).split('-')
  return `${day}/${month} ${timeOf(createdAt, zone)}`
}
