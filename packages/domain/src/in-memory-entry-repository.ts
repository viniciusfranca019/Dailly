import type { Entry } from './entry.js'
import type { EntryFilter, EntryRepository } from './entry-repository.js'
import { NotImplementedError } from './errors.js'

/**
 * The in-memory repository: production has one store (SQLite), and this exists
 * so use-cases can be tested without one ([ADR 0002 §1]).
 *
 * It is a hand-written fake, not a mock — it really stores and really orders,
 * so a test against it fails for the same reasons the real one would. The
 * shared contract test in `./testing` is what keeps the two honest.
 */
export const inMemoryEntryRepository = (seed: readonly Entry[] = []): EntryRepository => {
  const entries = new Map<string, Entry>(seed.map((entry) => [entry.id, entry]))

  return {
    async create(entry) {
      entries.set(entry.id, entry)
      return entry
    },

    async list(filter: EntryFilter) {
      let found = [...entries.values()]

      // Dates compare as strings because both sides are ISO-8601 and
      // zero-padded; `occurredAt` is a full instant, so its first ten
      // characters are its UTC calendar date. This is the in-memory reading of
      // the filter and it is deliberately UTC-only: the zone-aware conversion
      // belongs to the adapter that owns the zone (ADR 0007), which is the
      // server. A test that needs zone semantics runs against that one.
      if (filter.from) found = found.filter((entry) => entry.occurredAt.slice(0, 10) >= filter.from!)
      if (filter.to) found = found.filter((entry) => entry.occurredAt.slice(0, 10) <= filter.to!)

      if (filter.labelIds?.length) {
        const wanted = new Set(filter.labelIds)
        found = found.filter((entry) => entry.labelIds.some((id) => wanted.has(id)))
      }

      if (filter.props) {
        const pairs = Object.entries(filter.props)
        found = found.filter((entry) => pairs.every(([key, value]) => entry.props[key] === value))
      }

      // Newest first, and `createdAt` breaks the tie so that two entries with
      // the same `occurredAt` still have a stable order — the mvp says a new
      // entry shows up *at the top* of its day.
      return found.sort(
        (a, b) =>
          b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt),
      )
    },

    async update() {
      throw new NotImplementedError('update')
    },
    async delete() {
      throw new NotImplementedError('delete')
    },
    async getById() {
      throw new NotImplementedError('getById')
    },
  }
}
