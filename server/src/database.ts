import Database from 'better-sqlite3'
import type { Database as DatabaseHandle } from 'better-sqlite3'
import { migrate } from './migrations.js'

/**
 * Open a database and bring its schema up to date.
 *
 * The pragmas are not decoration:
 *
 * - **WAL** lets a reader and a writer coexist. With one desktop user that is
 *   rarely contended, but the failure it prevents — `SQLITE_BUSY` on a read
 *   while a write is in flight — is exactly the kind that shows up once the app
 *   is doing two things at a time and never in a test.
 * - **`foreign_keys`** is off by default in SQLite, and the Fase 2 schema
 *   (`entry_labels`, with `ON DELETE CASCADE`) depends on it. Turning it on now
 *   means the day those tables arrive the behaviour is already the real one.
 */
export function openDatabase(file: string): DatabaseHandle {
  const db = new Database(file)
  // WAL is a property of the file, and an in-memory database has none.
  if (file !== ':memory:') db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}
