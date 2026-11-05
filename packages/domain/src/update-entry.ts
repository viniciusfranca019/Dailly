import { parse, serialize } from '@dailly/whiteboard-core'
import type { Entry } from './entry.js'
import type { EntryRepository } from './entry-repository.js'
import { EmptyBodyError } from './errors.js'
import type { Clock, ISODateTime } from './time.js'

export interface UpdateEntryDeps {
  readonly entries: EntryRepository
  readonly clock: Clock
}

export interface EntryCorrection {
  readonly body: string
  /** Absent when the day did not change: the entry keeps its instant. */
  readonly occurredAt?: ISODateTime
}

/**
 * Correct an entry (PRD Fase 2, RN5): same id, same creation, a new update
 * stamp. The body is normalized and judged empty exactly as `createEntry`
 * does, so a corrected entry is stored in the same canonical form as a new one.
 */
export const updateEntry =
  ({ entries, clock }: UpdateEntryDeps) =>
  async (id: string, correction: EntryCorrection): Promise<Entry> => {
    const body = serialize(parse(correction.body))
    if (body.trim() === '') throw new EmptyBodyError()

    return entries.update(id, {
      body,
      ...(correction.occurredAt ? { occurredAt: correction.occurredAt } : {}),
      updatedAt: clock.now(),
    })
  }
