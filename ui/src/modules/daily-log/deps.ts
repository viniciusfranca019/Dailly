import type { Entry, EntryCorrection, EntryFilter, NewEntry } from '@dailly/domain'

/** O que é só do Daily Log: os use-cases de Entry. */
export interface DailyLogDeps {
  createEntry(input: NewEntry): Promise<Entry>
  queryEntries(filter?: EntryFilter): Promise<Entry[]>
  updateEntry(id: string, correction: EntryCorrection): Promise<Entry>
  deleteEntry(id: string): Promise<void>
}
