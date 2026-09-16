import type { Entry } from './entry.js'
import type { EntryFilter, EntryRepository } from './entry-repository.js'

export interface QueryEntriesDeps {
  readonly entries: EntryRepository
}

/**
 * Read the timeline.
 *
 * Thin on purpose, and still worth existing: it is the seam the UI depends on
 * (ADR 0001 — "a UI depende só de use-cases/ports"), so the day reading grows a
 * rule — a default period, a cap, entries hidden by some state — there is
 * already one place for it, and no screen has to learn about the repository.
 *
 * Ordering is not re-done here: the port promises newest first, and the
 * contract test holds every implementation to it.
 */
export const queryEntries =
  ({ entries }: QueryEntriesDeps) =>
  async (filter: EntryFilter = {}): Promise<Entry[]> =>
    entries.list(filter)
