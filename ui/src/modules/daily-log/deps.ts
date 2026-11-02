import type { Entry, EntryFilter, NewEntry } from '@dailly/domain'

/** O que é só do Daily Log: os dois use-cases de Entry. */
export interface DailyLogDeps {
  createEntry(input: NewEntry): Promise<Entry>
  queryEntries(filter?: EntryFilter): Promise<Entry[]>
}
