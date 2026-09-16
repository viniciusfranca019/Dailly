import { parse, serialize } from '@dailly/whiteboard-core'
import type { Entry, NewEntry } from './entry.js'
import type { EntryRepository } from './entry-repository.js'
import { EmptyBodyError } from './errors.js'
import type { IdGenerator } from './ids.js'
import type { Clock } from './time.js'

export interface CreateEntryDeps {
  readonly entries: EntryRepository
  readonly clock: Clock
  readonly ids: IdGenerator
}

/**
 * Create an entry.
 *
 * **The body is normalized here, once** (`docs/adaptacao-dailly.md` §3). The
 * whiteboard's `serialize` is canonical — `* a` becomes `- a`, `3)` becomes
 * `3.`, tabs become two spaces — so what the user typed and what round-trips
 * are not the same string. Normalizing on the way in means the stored body
 * already *is* the fixed point, and later "open and save without editing" is a
 * genuine no-op instead of a phantom `updatedAt` bump.
 *
 * This is also why the domain depends on `@dailly/whiteboard-core`, and why
 * that core is a package at all (ADR 0007, Emenda 1).
 */
export const createEntry =
  ({ entries, clock, ids }: CreateEntryDeps) =>
  async (input: NewEntry): Promise<Entry> => {
    const body = serialize(parse(input.body))

    // Emptiness is judged *after* normalizing, so whitespace and blank lines —
    // which normalization drops — fail the same way a truly empty body does.
    if (body.trim() === '') throw new EmptyBodyError()

    const now = clock.now()

    const entry: Entry = {
      id: ids.next(),
      body,
      // "A entrada escrita hoje sobre um fato do mês passado entra no resumo do
      // mês passado" — so the caller may say when it happened, and the common
      // case (saying nothing) means now.
      occurredAt: input.occurredAt ?? now,
      createdAt: now,
      updatedAt: now,
      labelIds: input.labelIds ?? [],
      props: input.props ?? {},
    }

    return entries.create(entry)
  }
