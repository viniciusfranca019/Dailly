import type { Entry, EntryFilter, EntryRepository } from '@dailly/domain'
import { NotImplementedError } from '@dailly/domain'
import { rangeBounds, type TimeZone } from '@dailly/periods'
import type { Database } from 'better-sqlite3'

/**
 * The one production store (ADR 0002 §1).
 *
 * It stores what it is given and does not re-derive anything: the body arrives
 * already normalized and the id already minted, because `createEntry` ran on
 * the renderer (see `@dailly/domain`'s `index.ts`). A store that normalized
 * again would be a second opinion about the same string, and two opinions are
 * how adapters start disagreeing.
 */

interface EntryRow {
  readonly id: string
  readonly body: string
  readonly occurred_at: string
  readonly created_at: string
  readonly updated_at: string
  readonly props: string
}

const toEntry = (row: EntryRow): Entry => ({
  id: row.id,
  body: row.body,
  occurredAt: row.occurred_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  // Fase 1 has no `entry_labels` table, so labels are always empty here rather
  // than absent: the field is part of `Entry`, and a reader should not have to
  // know which phase it is looking at.
  labelIds: [],
  props: JSON.parse(row.props) as Record<string, unknown>,
})

export interface SqliteEntryRepositoryDeps {
  readonly db: Database
  /** Needed to turn `from`/`to` — calendar dates — into instant bounds. */
  readonly zone: TimeZone
}

export const sqliteEntryRepository = ({ db, zone }: SqliteEntryRepositoryDeps): EntryRepository => {
  const insert = db.prepare<[string, string, string, string, string, string]>(
    `INSERT INTO entries (id, body, occurred_at, created_at, updated_at, props)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )

  return {
    async create(entry) {
      insert.run(
        entry.id,
        entry.body,
        entry.occurredAt,
        entry.createdAt,
        entry.updatedAt,
        JSON.stringify(entry.props),
      )
      return entry
    },

    async list(filter: EntryFilter) {
      if (filter.labelIds?.length) {
        // Honest refusal instead of silently ignoring the filter and returning
        // too much: there is no `entry_labels` table until Fase 2.
        throw new NotImplementedError('filtrar por label')
      }
      if (filter.props && Object.keys(filter.props).length > 0) {
        throw new NotImplementedError('filtrar por propriedade')
      }

      // The only place the zone touches storage. `from`/`to` are calendar days;
      // `occurred_at` is an instant. Half-open bounds (`>=`, `<`) so the last
      // millisecond of the last day is inside the range without anyone having
      // to write `23:59:59.999` (ADR 0007 · @dailly/periods).
      const bounds = rangeBounds(
        {
          ...(filter.from ? { from: filter.from } : {}),
          ...(filter.to ? { to: filter.to } : {}),
        },
        zone,
      )

      const where: string[] = []
      const params: string[] = []
      if (bounds.start) {
        where.push('occurred_at >= ?')
        params.push(bounds.start)
      }
      if (bounds.endExclusive) {
        where.push('occurred_at < ?')
        params.push(bounds.endExclusive)
      }

      const rows = db
        .prepare(
          `SELECT id, body, occurred_at, created_at, updated_at, props
             FROM entries
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY occurred_at DESC, created_at DESC`,
        )
        .all(...params) as EntryRow[]

      return rows.map(toEntry)
    },

    async update() {
      throw new NotImplementedError('update')
    },
    async delete() {
      throw new NotImplementedError('delete')
    },
    async getById() {
      throw new NotImplementedError('getById')
    },
  }
}
