/**
 * The domain: entities, ports and use-cases for the Daily Log.
 *
 * **Where this code runs, because the next reader will guess wrong.** The
 * use-cases run in the **renderer**, composed over an `EntryRepository` that
 * speaks HTTP (`HttpEntryRepository`, in `ui/`). The server is the other side
 * of that port — `SqliteEntryRepository` behind a Fastify surface — not a
 * second place where use-cases live.
 *
 * Three documents force that reading and none of them alone makes it obvious:
 * ADR 0001 ("a UI depende só de use-cases/ports"), ADR 0002 §6 ("`id` = UUID
 * gerado no cliente") and the Fase 1 unit list, which names `HttpEntryRepository`
 * in `ui/` — dead code under any other arrangement.
 *
 * Consequence worth stating: what crosses the wire is a finished `Entry`. The
 * server validates it and stores it; it does not re-stamp, re-normalize or mint
 * ids. Guarding the store is not redoing the domain.
 */

export type { Entry, NewEntry } from './entry.js'
export type { EntryFilter, EntryRepository } from './entry-repository.js'
export { EmptyBodyError, NotImplementedError } from './errors.js'

export type { Clock, ISODateTime } from './time.js'
export { fixedClock, systemClock } from './time.js'

export type { IdGenerator } from './ids.js'
export { sequentialIds, uuidIds } from './ids.js'

export { inMemoryEntryRepository } from './in-memory-entry-repository.js'

export { createEntry } from './create-entry.js'
export type { CreateEntryDeps } from './create-entry.js'
export { queryEntries } from './query-entries.js'
export type { QueryEntriesDeps } from './query-entries.js'
