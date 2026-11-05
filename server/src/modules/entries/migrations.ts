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
  {
    // Labels (PRD Fase 2, RN1, card #34): global, so they live with the Entry
    // and not with a product. `name_key` is the case-folded name the domain
    // computes (`labelKey`), because SQLite's lower() folds ASCII only and
    // "Saúde" and "SAÚDE" must collide. Both foreign keys cascade: deleting a
    // label takes it off every entry and task (RN2), deleting an entry takes
    // its labels off it.
    version: 6,
    up: `
      CREATE TABLE labels (
        id       TEXT PRIMARY KEY,
        name     TEXT NOT NULL,
        name_key TEXT NOT NULL UNIQUE,
        color    TEXT NOT NULL
      );
      CREATE TABLE entry_labels (
        entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
        PRIMARY KEY (entry_id, label_id)
      );
      CREATE INDEX idx_entry_labels_label ON entry_labels(label_id);
    `,
  },
]
