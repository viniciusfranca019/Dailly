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

taskStoreContract('sqliteTaskStore', {
  make: (labels = []) => {
    const db = migrated()
    // The global labels the contract says exist, as the Daily Log would have made them.
    const insert = db.prepare('INSERT INTO labels (id, name, name_key, color) VALUES (?, ?, ?, ?)')
    for (const id of labels) insert.run(id, id, id, 'blue')
    return sqliteTaskStore({ db, ...deps() })
  },
})

describe('sqliteTaskStore — a refused board (LAB-7 C4)', () => {
  it('writes no status when the prefix is taken', async () => {
    const db = migrated()
    const store = sqliteTaskStore({ db, ...deps() })
    await store.createBoard({ name: 'Labs', prefix: 'LAB' })
    const count = () => (db.prepare('SELECT COUNT(*) AS n FROM task_statuses').get() as { n: number }).n
    const before = count()

    await expect(store.createBoard({ name: 'Outro', prefix: 'LAB' })).rejects.toThrow(
      'o prefixo LAB já foi usado por um board',
    )

    expect(count()).toBe(before)
  })
})

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

describe('sqliteTaskStore — programs survive a rebuild of tasks (LAB-9)', () => {
  it('keeps the members and the focus when a later migration copies and renames `tasks`', async () => {
    const db = migrated()
    const store = sqliteTaskStore({ db, ...deps() })
    await store.create({ boardId: 'tasks', title: 'um', statusId: 'todo' })
    await store.create({ boardId: 'tasks', title: 'dois', statusId: 'todo' })
    const program = await store.createProgram({ name: 'Dailly v1', objective: '', windowStart: null, windowEnd: null, exitWhen: '' })
    await store.addToProgram(program.id, { prefix: 'T', key: 1 })
    await store.setFocus({ task: { prefix: 'T', key: 2 } }, 'P1')

    // The copy-and-rename migrations 8 and 10 use, with foreign keys on.
    db.transaction(() => {
      db.exec('CREATE TABLE tasks_copy AS SELECT * FROM tasks')
      db.exec('DROP TABLE tasks')
      db.exec('ALTER TABLE tasks_copy RENAME TO tasks')
    })()

    expect((await store.programs())[0]?.tasks.map((task) => task.key)).toEqual(['T-1'])
    expect((await store.focus()).P1).toEqual([{ kind: 'task', key: 'T-2', title: 'dois' }])
  })
})

describe('sqliteTaskStore — migration 12 adds the program comments (programa-comentarios)', () => {
  it('keeps the programs and the task comments a database at version 11 already had', async () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    const slices = [...entriesModule.migrations, ...TASKS_MIGRATIONS].sort((a, b) => a.version - b.version)
    for (const migration of slices.filter((one) => one.version <= 11)) db.exec(migration.up)
    const before = sqliteTaskStore({ db, ...deps() })
    await before.create({ boardId: 'tasks', title: 'um', statusId: 'todo' })
    const taskComment = await before.addComment({ prefix: 'T', key: 1 }, 'liguei pro encanador')
    const program = await before.createProgram({ name: 'Dailly v1', objective: '', windowStart: null, windowEnd: null, exitWhen: '' })

    for (const migration of slices.filter((one) => one.version > 11)) db.exec(migration.up)
    const after = sqliteTaskStore({ db, ...deps() })

    expect(await after.comments({ prefix: 'T', key: 1 })).toEqual([taskComment])
    expect((await after.programs()).map((one) => one.name)).toEqual(['Dailly v1'])
    expect(await after.programComments(program.id)).toEqual([])
    expect(await after.addProgramComment(program.id, 'ele vem quinta')).toMatchObject({ body: 'ele vem quinta' })
  })

  it('takes the comments with a program row that is deleted (ON DELETE CASCADE)', async () => {
    const db = migrated()
    const store = sqliteTaskStore({ db, ...deps() })
    const program = await store.createProgram({ name: 'Dailly v1', objective: '', windowStart: null, windowEnd: null, exitWhen: '' })
    await store.addProgramComment(program.id, 'ele vem quinta')

    db.prepare('DELETE FROM task_programs WHERE id = ?').run(program.id)

    expect(db.prepare('SELECT count(*) AS total FROM task_program_comments').get()).toEqual({ total: 0 })
  })
})

describe('sqliteTaskStore — program comments of the same instant (programa-comentarios)', () => {
  it('stay in the order they were written, not in the order of their ids', async () => {
    const db = migrated()
    let id = 10
    const store = sqliteTaskStore({ db, newId: () => `id-${(id -= 1)}`, now: () => '2026-11-26T12:00:00.000Z' })
    const program = await store.createProgram({ name: 'Dailly v1', objective: '', windowStart: null, windowEnd: null, exitWhen: '' })

    await store.addProgramComment(program.id, 'liguei pro encanador')
    await store.addProgramComment(program.id, 'ele vem quinta')

    expect((await store.programComments(program.id))?.map((comment) => comment.body)).toEqual([
      'liguei pro encanador',
      'ele vem quinta',
    ])
  })
})
