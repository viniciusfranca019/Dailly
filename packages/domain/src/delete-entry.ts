import type { EntryRepository } from './entry-repository.js'

export interface DeleteEntryDeps {
  readonly entries: EntryRepository
}

/** Delete an entry. An unknown id is the repository's `EntryNotFoundError`. */
export const deleteEntry =
  ({ entries }: DeleteEntryDeps) =>
  (id: string): Promise<void> =>
    entries.delete(id)
