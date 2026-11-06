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
    const task = await sqliteTaskStore({ db, ...deps() }).create({ boardId: 'tasks', title: 'Comprar café', statusId: 'todo' })

    expect(db.prepare('SELECT id, kind, body, occurred_at FROM entries').all()).toEqual([
      { id: task.id, kind: 'task', body: '', occurred_at: '2026-11-05T12:00:00.000Z' },
    ])
  })

  it('takes the Entry with it when the task is deleted', async () => {
    const db = migrated()
    const store = sqliteTaskStore({ db, ...deps() })
    await store.create({ boardId: 'tasks', title: 'x', statusId: 'todo' })

    await store.delete({ prefix: 'T', key: 1 })

    expect(db.prepare('SELECT count(*) AS total FROM entries').get()).toEqual({ total: 0 })
  })

  it('writes neither row when the task is refused', async () => {
    const db = migrated()
    await expect(
      sqliteTaskStore({ db, ...deps() }).create({ boardId: 'tasks', title: 'x', statusId: 'nope' }),
    ).rejects.toThrow()

    expect(db.prepare('SELECT count(*) AS total FROM entries').get()).toEqual({ total: 0 })
  })

  it('writes the body on the Entry and touches its updated_at', async () => {
    const db = migrated()
    let clock = 0
    const store = sqliteTaskStore({
      db,
      newId: () => '00000000-0000-4000-8000-000000000001',
      now: () => `2026-11-05T12:00:0${(clock += 1)}.000Z`,
    })
    await store.create({ boardId: 'tasks', title: 'x', statusId: 'todo' })

    await store.update({ prefix: 'T', key: 1 }, { body: '# notas' })

    expect(db.prepare('SELECT body, created_at, updated_at FROM entries').get()).toEqual({
      body: '# notas',
      created_at: '2026-11-05T12:00:01.000Z',
      updated_at: '2026-11-05T12:00:02.000Z',
    })
  })
})

describe('sqliteTaskStore — the comments go with the task (card #45)', () => {
  it('leaves no row in task_comments after the task is deleted', async () => {
    const db = migrated()
    const store = sqliteTaskStore({ db, ...deps() })
    await store.create({ boardId: 'tasks', title: 'x', statusId: 'todo' })
    await store.addComment({ prefix: 'T', key: 1 }, 'ele vem quinta')

    await store.delete({ prefix: 'T', key: 1 })

    expect(db.prepare('SELECT count(*) AS total FROM task_comments').get()).toEqual({ total: 0 })
  })
})
