import type { Migration } from '../../shell/module.js'

/**
 * A fatia do módulo Entries no `user_version`.
 *
 * `labels`, `entry_labels` e `property_defs` são Fase 2 no roadmap e estão
 * deliberadamente ausentes: uma tabela sem leitor é um palpite sobre um formato
 * que ninguém usou ainda. Elas chegam como migration 2, e o runner já existe
 * para que isso não custe nada.
 *
 * O número é global, não do módulo — ver `collectMigrations`.
 */
export const ENTRIES_MIGRATIONS: readonly Migration[] = [
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
