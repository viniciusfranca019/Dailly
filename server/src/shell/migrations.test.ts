import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { DatabaseTooNewError, LATEST_VERSION, migrate } from './migrations.js'

const fresh = () => new Database(':memory:')

describe('migrate', () => {
  it('takes a new database to the latest version', () => {
    const db = fresh()
    expect(db.pragma('user_version', { simple: true })).toBe(0)

    expect(migrate(db)).toBe(LATEST_VERSION)
  })

  it('creates the entries table with the columns ADR 0002 specified', () => {
    const db = fresh()
    migrate(db)

    const columns = (db.pragma('table_info(entries)') as { name: string }[]).map(
      (column) => column.name,
    )

    expect(columns.sort()).toEqual(
      ['body', 'created_at', 'id', 'occurred_at', 'props', 'updated_at'].sort(),
    )
  })

  it('is idempotent — running twice changes nothing and throws nothing', () => {
    // The runner executes on every boot, so "already migrated" is the common
    // case, not the edge one.
    const db = fresh()
    migrate(db)
    db.prepare(
      `INSERT INTO entries (id, body, occurred_at, created_at, updated_at, props)
       VALUES ('a', 'corpo', '2026-07-24T10:00:00.000Z', '2026-07-24T10:00:00.000Z', '2026-07-24T10:00:00.000Z', '{}')`,
    ).run()

    expect(() => migrate(db)).not.toThrow()
    expect(db.prepare('SELECT count(*) as total FROM entries').get()).toEqual({ total: 1 })
  })

  it('refuses to open a database from a newer version of the app', () => {
    // The restore trap from ADR 0005: a backup written by a newer build. Opening
    // it silently is how data gets corrupted quietly.
    const db = fresh()
    db.pragma(`user_version = ${LATEST_VERSION + 1}`)

    expect(() => migrate(db)).toThrow(DatabaseTooNewError)
  })

  it('indexes occurred_at, which is what every listing orders by', () => {
    const db = fresh()
    migrate(db)

    const indexes = (db.pragma('index_list(entries)') as { name: string }[]).map(
      (index) => index.name,
    )

    expect(indexes).toContain('idx_entries_occurred_at')
  })
})
