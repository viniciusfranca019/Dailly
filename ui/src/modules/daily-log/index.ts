/**
 * Daily Log — public surface.
 *
 * Everything another module may touch passes through here. `modules/analyse`
 * consumes this module's material (ADR 0001), so when `Entry`, `Label` and
 * `EntryRepository` arrive in Phase 1 they are exported from this file and from
 * nowhere else; a deep import into `modules/daily-log/**` from outside is a
 * boundary violation, and `tests/architecture` fails on it.
 */
export { mountDailyLog as mount } from './ui/daily-log.js'
