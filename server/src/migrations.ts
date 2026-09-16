import type { Database } from 'better-sqlite3'

/**
 * Schema versioning through `PRAGMA user_version`, as
 * [ADR 0002 §5](../../docs/adrs/0002-data-layer.md) decided.
 *
 * The version lives **inside the file**, which is what makes ADR 0005's backup
 * story work: restoring an old `.sqlite` and opening it runs exactly the
 * migrations it is missing, with no external bookkeeping to lose.
 */

export interface Migration {
  readonly version: number
  readonly up: string
}

/**
 * Fase 1 creates one table.
 *
 * `labels`, `entry_labels` and `property_defs` are Fase 2 in the roadmap and
 * are deliberately absent: a table with no reader is a guess about a shape
 * nobody has used yet. They arrive as migration 2, and the runner exists so
 * that costs nothing.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE entries (
        id          TEXT PRIMARY KEY,
        body        TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        props       TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX idx_entries_occurred_at ON entries(occurred_at);
    `,
  },
]

/** The version this build of the app expects a database to be at. */
export const LATEST_VERSION = MIGRATIONS.reduce(
  (latest, migration) => Math.max(latest, migration.version),
  0,
)

export class DatabaseTooNewError extends Error {
  override readonly name = 'DatabaseTooNewError'
  constructor(found: number, expected: number) {
    super(
      `o banco está na versão ${found}, mas esta versão do dailly conhece até a ${expected}. ` +
        'Abrir assim arriscaria corromper dados escritos por uma versão mais nova.',
    )
  }
}

/**
 * Bring a database up to `LATEST_VERSION`, and report where it landed.
 *
 * Each migration runs inside a transaction together with the bump of
 * `user_version`, so a failure halfway leaves the file at the last version that
 * fully applied — never at a version whose statements only half ran.
 */
export function migrate(db: Database): number {
  const current = db.pragma('user_version', { simple: true }) as number

  // Refusing to open a newer file is the cheap half of the backup story: a
  // restore from a future version is a data-loss trap, and silence is the worst
  // possible answer to it.
  if (current > LATEST_VERSION) throw new DatabaseTooNewError(current, LATEST_VERSION)

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue
    db.transaction(() => {
      db.exec(migration.up)
      // `user_version` takes no bound parameter, hence the interpolation. The
      // value is a number from this module's own list, never user input.
      db.pragma(`user_version = ${migration.version}`)
    })()
  }

  return db.pragma('user_version', { simple: true }) as number
}
