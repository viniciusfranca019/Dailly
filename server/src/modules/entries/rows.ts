import type { Database } from 'better-sqlite3'

/**
 * The seam between Entries and Tasks (PRD annex, "A costura").
 *
 * A task is an Entry plus a facet, written in one transaction. The Tasks
 * module opens the transaction on its own `db`; it may not reach the
 * `entries` table from the inside (the boundary rule lets a module see only
 * another's index), so Entries hands out these two writes through its index.
 * They run inside whatever transaction the caller has open.
 */
export interface EntryRow {
  readonly id: string
  readonly kind: 'log' | 'task'
  readonly body: string
  readonly occurredAt: string
  readonly createdAt: string
  readonly updatedAt: string
}

export function insertEntryRow(db: Database, row: EntryRow): void {
  db.prepare(
    `INSERT INTO entries (id, kind, body, occurred_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.kind, row.body, row.occurredAt, row.createdAt, row.updatedAt)
}

/** Whatever hangs off the entry with `ON DELETE CASCADE` goes with it. */
export function deleteEntryRow(db: Database, id: string): void {
  db.prepare('DELETE FROM entries WHERE id = ?').run(id)
}
