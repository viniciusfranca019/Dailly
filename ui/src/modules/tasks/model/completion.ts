import { dayOf, type TimeZone } from '@dailly/periods'

/**
 * "concluída em 05/11": the day of the RN3 stamp, in the configured zone,
 * because a task closed at 22:30 in São Paulo was closed that day, not the
 * next one in UTC. `null` for an open task, which shows nothing.
 */
export function completionLabel(completedAt: string | null, zone: TimeZone): string | null {
  if (completedAt === null) return null
  const [, month, day] = dayOf(completedAt, zone).split('-')
  return `concluída em ${day}/${month}`
}
