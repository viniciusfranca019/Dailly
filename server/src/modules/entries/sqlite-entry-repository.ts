import type { Entry, EntryFilter, EntryRepository } from '@dailly/domain'
import { EntryNotFoundError, NotImplementedError } from '@dailly/domain'
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
  /** `group_concat` of the label ids, `null` when it has none. UUIDs hold no comma. */
  readonly label_ids: string | null
}

const toEntry = (row: EntryRow): Entry => ({
  id: row.id,
  body: row.body,
  occurredAt: row.occurred_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  labelIds: row.label_ids ? row.label_ids.split(',') : [],
  props: JSON.parse(row.props) as Record<string, unknown>,
})

/** The labels of each row, read in the same statement (card #34). */
const LABEL_IDS = `(SELECT group_concat(label_id) FROM entry_labels WHERE entry_id = entries.id) AS label_ids`

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

  const getById = async (id: string): Promise<Entry | null> => {
    const row = db
      .prepare(
        `SELECT id, body, occurred_at, created_at, updated_at, props, ${LABEL_IDS}
           FROM entries WHERE id = ? AND kind = 'log'`,
      )
      .get(id) as EntryRow | undefined
    return row ? toEntry(row) : null
  }

  const tag = db.prepare<[string, string]>('INSERT INTO entry_labels (entry_id, label_id) VALUES (?, ?)')
  const untag = db.prepare<[string]>('DELETE FROM entry_labels WHERE entry_id = ?')
  /** The set an entry carries, replaced whole: what the patch says is what it has. */
  const label = (id: string, labelIds: readonly string[]) => {
    untag.run(id)
    for (const labelId of new Set(labelIds)) tag.run(id, labelId)
  }

  const create = db.transaction((entry: Entry) => {
    insert.run(
      entry.id,
      entry.body,
      entry.occurredAt,
      entry.createdAt,
      entry.updatedAt,
      JSON.stringify(entry.props),
    )
    label(entry.id, entry.labelIds)
  })

  return {
    async create(entry) {
      create(entry)
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

      // The timeline is the record of the day (PRD RN6): a task is an Entry
      // too, but not a fact of the day, so it never comes out of this port.
      const where: string[] = ["kind = 'log'"]
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
          `SELECT id, body, occurred_at, created_at, updated_at, props, ${LABEL_IDS}
             FROM entries
            WHERE ${where.join(' AND ')}
            ORDER BY occurred_at DESC, created_at DESC`,
        )
        .all(...params) as EntryRow[]

      return rows.map(toEntry)
    },

    // Only day logs: a task is an Entry too, but it is edited and deleted by
    // the Tasks module (PRD RN6), and deleting its Entry here would take the
    // task with it through the cascade.
    getById,

    async update(id, patch) {
      db.transaction(() => {
        const changed = db
          .prepare(
            `UPDATE entries
                SET body = coalesce(?, body),
                    occurred_at = coalesce(?, occurred_at),
                    updated_at = ?
              WHERE id = ? AND kind = 'log'`,
          )
          .run(patch.body ?? null, patch.occurredAt ?? null, patch.updatedAt, id)
        if (changed.changes === 0) throw new EntryNotFoundError()
        if (patch.labelIds) label(id, patch.labelIds)
      })()
      return (await getById(id))!
    },

    async delete(id) {
      const changed = db.prepare(`DELETE FROM entries WHERE id = ? AND kind = 'log'`).run(id)
      if (changed.changes === 0) throw new EntryNotFoundError()
    },
  }
}
