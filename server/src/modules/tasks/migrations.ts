import type { Migration } from '../../shell/module.js'

/**
 * The Tasks slice of the `user_version`: 5 after Entries' 4 (the `kind` column
 * this facet hangs off), then 8 for the boards (F4, card #42) and 9 for the
 * comments (F7, card #45).
 *
 * - `task_statuses` is seeded with the five fixed statuses of the v1; the
 *   category has a CHECK because rules read it, never the name (RN2). The
 *   seed is `DEFAULT_STATUSES` of `@dailly/tasks-core`, and the contract suite
 *   fails if the two drift.
 * - `tasks` is the facet: the Entry's id as its key, gone with the Entry.
 * - `task_counter` holds the last key handed out, so deleting the highest
 *   task does not give its key back (RN5); `MAX(key) + 1` would. Migration 8
 *   moves it into each board and drops it.
 *
 * Migration 8 (F4):
 *
 * - `task_boards` holds each board with its own counter; `prefix` is the one
 *   new tasks take. `task_board_prefixes` holds every prefix a board ever
 *   used (RN9): the refusal reads it, not `task_boards`, so a prefix left
 *   behind stays reserved.
 * - The board "Tasks" (id `tasks`, prefix T) is seeded with the counter of
 *   the v1, so the next task after T-9 is T-10 even if T-9 was deleted
 *   (RN10, RN5).
 * - `tasks` is rebuilt to gain `board_id` and `key_prefix`, the prefix frozen
 *   on the task (RN5). SQLite cannot add a NOT NULL foreign key nor swap a
 *   UNIQUE in place, hence the copy; every row, key and status is kept and
 *   lands in the board `tasks` with prefix T. `entries` is not touched.
 *
 * Migration 9 (F7): `task_comments`, the comments of a task (P4 of the PRD:
 * not Entries, so they never reach the Daily Log, RN14). `entry_id` is the
 * task's Entry, and the foreign key points at `entries`, not at `tasks`: a
 * later rebuild of `tasks` (the copy-and-rename above) drops that table, and
 * with `foreign_keys` on a cascade from it would take every comment along.
 * Deleting a task deletes its Entry, so the cascade still takes its comments.
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
  {
    version: 8,
    up: `
      CREATE TABLE task_boards (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        prefix     TEXT NOT NULL UNIQUE,
        counter    INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE task_board_prefixes (
        prefix   TEXT PRIMARY KEY,
        board_id TEXT NOT NULL REFERENCES task_boards(id)
      );
      INSERT INTO task_boards (id, name, prefix, counter, created_at)
        SELECT 'tasks', 'Tasks', 'T', last_key, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          FROM task_counter WHERE id = 1;
      INSERT INTO task_board_prefixes (prefix, board_id) VALUES ('T', 'tasks');
      DROP TABLE task_counter;

      CREATE TABLE tasks_v8 (
        entry_id     TEXT PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE,
        board_id     TEXT NOT NULL REFERENCES task_boards(id),
        key          INTEGER NOT NULL,
        key_prefix   TEXT NOT NULL,
        title        TEXT NOT NULL,
        status_id    TEXT NOT NULL REFERENCES task_statuses(id),
        priority     INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 4),
        rank         TEXT NOT NULL,
        completed_at TEXT,
        UNIQUE (board_id, key),
        UNIQUE (key_prefix, key)
      );
      INSERT INTO tasks_v8 (entry_id, board_id, key, key_prefix, title, status_id, priority, rank, completed_at)
        SELECT entry_id, 'tasks', key, 'T', title, status_id, priority, rank, completed_at FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_v8 RENAME TO tasks;
      CREATE INDEX idx_tasks_board_status_rank ON tasks(board_id, status_id, rank);
    `,
  },
  {
    version: 9,
    up: `
      CREATE TABLE task_comments (
        id         TEXT PRIMARY KEY,
        entry_id   TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        body       TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_task_comments_entry_created ON task_comments(entry_id, created_at);
    `,
  },
]
