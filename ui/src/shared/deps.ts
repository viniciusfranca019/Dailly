import type { Entry, EntryFilter, NewEntry } from '@dailly/domain'
import type { TimeZone } from '@dailly/periods'

/**
 * What the composition root hands a module.
 *
 * Use-cases, never a repository: ADR 0001 says the UI depends only on
 * use-cases and ports, and a screen that could see the repository would
 * eventually reach past them. The module cannot tell whether the store is
 * SQLite across a socket or a fake in a test, which is the point.
 *
 * `zone` rides along because ADR 0007 requires the UI to **always** show which
 * zone is in use — it is not a Settings detail, it is on screen.
 */
export interface ModuleDeps {
  createEntry(input: NewEntry): Promise<Entry>
  queryEntries(filter?: EntryFilter): Promise<Entry[]>
  readonly zone: TimeZone
}
