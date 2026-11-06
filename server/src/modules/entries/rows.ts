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

/**
 * Touch the Entry after its facet changed, and replace its body when one is
 * given (the task panel, card #22). `updated_at` moves either way, since the
 * Entry is the atom a future aggregate reads.
 */
export function updateEntryRow(db: Database, id: string, change: { readonly body?: string }, updatedAt: string): void {
  if (change.body === undefined) {
    db.prepare('UPDATE entries SET updated_at = ? WHERE id = ?').run(updatedAt, id)
  } else {
    db.prepare('UPDATE entries SET body = ?, updated_at = ? WHERE id = ?').run(change.body, updatedAt, id)
  }
}

/**
 * Replace the labels an Entry carries (card #46, RN13): the Tasks module puts
 * the global labels on a task's Entry through this, inside its own
 * transaction, because `/entries` answers 404 for a task (RN6). The caller
 * checks that every id exists first; the foreign key is the last guard.
 */
export function setEntryLabels(db: Database, id: string, labelIds: readonly string[]): void {
  db.prepare('DELETE FROM entry_labels WHERE entry_id = ?').run(id)
  const tag = db.prepare('INSERT INTO entry_labels (entry_id, label_id) VALUES (?, ?)')
  for (const labelId of new Set(labelIds)) tag.run(id, labelId)
}

/** Whether every id names a label that exists. */
export function labelsExist(db: Database, labelIds: readonly string[]): boolean {
  const unique = [...new Set(labelIds)]
  if (unique.length === 0) return true
  const found = db
    .prepare(`SELECT count(*) AS total FROM labels WHERE id IN (${unique.map(() => '?').join(', ')})`)
    .get(...unique) as { total: number }
  return found.total === unique.length
}
