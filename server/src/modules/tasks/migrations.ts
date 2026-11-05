import type { Migration } from '../../shell/module.js'

/**
 * The Tasks slice of the `user_version`, after Entries' 4 (the `kind` column
 * this facet hangs off).
 *
 * - `task_statuses` is seeded with the five fixed statuses of the v1; the
 *   category has a CHECK because rules read it, never the name (RN2). The
 *   seed is `DEFAULT_STATUSES` of `@dailly/tasks-core`, and the contract suite
 *   fails if the two drift.
 * - `tasks` is the facet: the Entry's id as its key, gone with the Entry.
 * - `task_counter` holds the last key handed out, so deleting the highest
 *   task does not give its key back (RN5); `MAX(key) + 1` would.
 */
export const TASKS_MIGRATIONS: readonly Migration[] = [
  {
    version: 5,
    up: `
      CREATE TABLE task_statuses (
        id       TEXT PRIMARY KEY,
        name     TEXT NOT NULL,
        category TEXT NOT NULL
                 CHECK (category IN ('backlog', 'unstarted', 'started', 'completed', 'canceled')),
        position INTEGER NOT NULL
      );
      INSERT INTO task_statuses (id, name, category, position) VALUES
        ('backlog',  'Backlog',   'backlog',   0),
        ('todo',     'A fazer',   'unstarted', 1),
        ('doing',    'Fazendo',   'started',   2),
        ('done',     'Feito',     'completed', 3),
        ('canceled', 'Cancelado', 'canceled',  4);

      CREATE TABLE tasks (
        entry_id     TEXT PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE,
        key          INTEGER NOT NULL UNIQUE,
        title        TEXT NOT NULL,
        status_id    TEXT NOT NULL REFERENCES task_statuses(id),
        priority     INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 4),
        rank         TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX idx_tasks_status_rank ON tasks(status_id, rank);

      CREATE TABLE task_counter (
        id       INTEGER PRIMARY KEY CHECK (id = 1),
        last_key INTEGER NOT NULL
      );
      INSERT INTO task_counter (id, last_key) VALUES (1, 0);
    `,
  },
]
