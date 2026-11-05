import { taskStoreContract } from '@dailly/tasks-core/testing'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { entriesModule } from '../entries/index.js'
import { TASKS_MIGRATIONS } from './migrations.js'
import { sqliteTaskStore } from './sqlite-task-store.js'

/**
 * The schema comes from the two slices the store touches, entries' and its
 * own, not from the shell's `openDatabase`: the boundary rule keeps a module
 * out of the shell, and applying the slices keeps this test standing without
 * the rest of the server (the same reason as `sqlite-request-store.test.ts`).
 */
const migrated = () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  const slices = [...entriesModule.migrations, ...TASKS_MIGRATIONS].sort(
    (a, b) => a.version - b.version,
  )
  for (const migration of slices) db.exec(migration.up)
  return db
}

let n = 0
const deps = () => ({
  newId: () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`,
  now: () => '2026-11-05T12:00:00.000Z',
})

taskStoreContract('sqliteTaskStore', { make: () => sqliteTaskStore({ db: migrated(), ...deps() }) })

describe('sqliteTaskStore — the task is an Entry (RN1)', () => {
  it('writes the Entry with the same id, kind "task", in the same transaction', async () => {
    const db = migrated()
    const task = await sqliteTaskStore({ db, ...deps() }).create({ title: 'Comprar café', statusId: 'todo' })

    expect(db.prepare('SELECT id, kind, body, occurred_at FROM entries').all()).toEqual([
      { id: task.id, kind: 'task', body: '', occurred_at: '2026-11-05T12:00:00.000Z' },
    ])
  })

  it('takes the Entry with it when the task is deleted', async () => {
    const db = migrated()
    const store = sqliteTaskStore({ db, ...deps() })
    await store.create({ title: 'x', statusId: 'todo' })

    await store.delete(1)

    expect(db.prepare('SELECT count(*) AS total FROM entries').get()).toEqual({ total: 0 })
  })

  it('writes neither row when the task is refused', async () => {
    const db = migrated()
    await expect(
      sqliteTaskStore({ db, ...deps() }).create({ title: 'x', statusId: 'nope' }),
    ).rejects.toThrow()

    expect(db.prepare('SELECT count(*) AS total FROM entries').get()).toEqual({ total: 0 })
  })
})
