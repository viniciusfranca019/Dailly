import type { Migration } from '../../shell/module.js'

/**
 * A fatia do módulo Entries no `user_version`.
 *
 * `labels`, `entry_labels` e `property_defs` são Fase 2 no roadmap e estão
 * deliberadamente ausentes: uma tabela sem leitor é um palpite sobre um formato
 * que ninguém usou ainda. Elas chegam na próxima versão livre, e o runner já
 * existe para que isso não custe nada.
 *
 * O número não é nomeado aqui de propósito: o `user_version` é global, e
 * reservar não é tomar. Este comentário dizia "migration 2" e o módulo
 * Requests aterrissou primeiro — quem escreve a migration é quem aloca.
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
  {
    // Tasks (PRD RN1): a task is an Entry with a facet, so the core learns one
    // thing, what kind of entry it is. Every row already here is a day log,
    // which is what the DEFAULT says. The timeline reads only 'log' (RN6).
    version: 4,
    up: `
      ALTER TABLE entries
        ADD COLUMN kind TEXT NOT NULL DEFAULT 'log' CHECK (kind IN ('log', 'task'));
    `,
  },
]
