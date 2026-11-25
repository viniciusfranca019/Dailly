/** `2026-11-25` → `25/11/2026`, how the program's window is shown. */
export const shownDate = (date: string): string => date.split('-').reverse().join('/')

/** The window in one phrase, or nothing when the program has none. */
export function shownWindow(start: string | null, end: string | null): string {
  if (start && end) return `${shownDate(start)} a ${shownDate(end)}`
  if (start) return `desde ${shownDate(start)}`
  if (end) return `até ${shownDate(end)}`
  return ''
}
