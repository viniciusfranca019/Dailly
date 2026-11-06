import { UTC } from '@dailly/periods'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './shell/app.js'
import { openDatabase } from './shell/database.js'
import { MIGRATIONS, migrate } from './shell/migrations.js'

/**
 * Boards over HTTP (card #42, F4), with the real manifest and a real SQLite.
 * At the root of `src/` for the same reason as `tasks.test.ts`: it builds the
 * whole app.
 */
let app: ReturnType<typeof buildApp>

beforeEach(() => {
  app = buildApp({ db: openDatabase(':memory:'), zone: UTC })
})

const boards = async () => (await app.inject({ method: 'GET', url: '/boards' })).json()
const createBoard = (payload: unknown) => app.inject({ method: 'POST', url: '/boards', payload: payload as object })
const patchBoard = (id: string, payload: unknown) =>
  app.inject({ method: 'PATCH', url: `/boards/${id}`, payload: payload as object })
const createTask = (payload: unknown) => app.inject({ method: 'POST', url: '/tasks', payload: payload as object })
const read = async (boardId: string) => (await app.inject({ method: 'GET', url: `/tasks?boardId=${boardId}` })).json()
/** A board's own "A fazer": since F5 (#43) each board has statuses of its own. */
const todoOf = async (boardId: string): Promise<string> =>
  (await read(boardId)).statuses.find((status: { name: string }) => status.name === 'A fazer').id
const keys = (board: { tasks: { keyPrefix: string; key: number }[] }) =>
  board.tasks.map((task) => `${task.keyPrefix}-${task.key}`)

describe('GET /boards', () => {
  it('answers the "Tasks" board, of prefix T, on a new file (RN10)', async () => {
    expect(await boards()).toEqual([{ id: 'tasks', name: 'Tasks', prefix: 'T' }])
  })
})

describe('POST /boards', () => {
  it('C1: creates "Casa", listed after "Tasks", empty, with the five statuses', async () => {
    const response = await createBoard({ name: 'Casa', prefix: 'CASA' })

    expect(response.statusCode).toBe(201)
    const casa = response.json()
    expect(casa).toMatchObject({ name: 'Casa', prefix: 'CASA' })
    expect((await boards()).map((board: { name: string }) => board.name)).toEqual(['Tasks', 'Casa'])
    const board = await read(casa.id)
    expect(board.tasks).toEqual([])
    expect(board.statuses.map((status: { name: string }) => status.name)).toEqual([
      'Backlog',
      'A fazer',
      'Fazendo',
      'Feito',
      'Cancelado',
    ])
  })

  it.each([
    ['', 'o prefixo é obrigatório'],
    ['CA-SA', 'o prefixo usa só letras de A a Z e números'],
    ['CASINHA', 'o prefixo tem no máximo 6 caracteres'],
  ])('C2: refuses the prefix %j with 400, naming the field, and creates nothing', async (prefix, message) => {
    const response = await createBoard({ name: 'Casa', prefix })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ errors: [{ field: 'prefix', message }] })
    expect(await boards()).toHaveLength(1)
  })

  it('C2: refuses a prefix already used with 409 (RN9)', async () => {
    const response = await createBoard({ name: 'Casa', prefix: 'T' })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({ error: 'o prefixo T já foi usado por um board' })
    expect(await boards()).toHaveLength(1)
  })

  it('C3: refuses an empty name with 400, naming the field', async () => {
    const response = await createBoard({ name: ' ', prefix: 'CASA' })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ errors: [{ field: 'name', message: 'o nome é obrigatório' }] })
    expect(await boards()).toHaveLength(1)
  })

  it('refuses a body without name and prefix as text', async () => {
    for (const payload of [[], { name: 'Casa' }, { name: 'Casa', prefix: 3 }]) {
      expect((await createBoard(payload)).statusCode).toBe(400)
    }
  })
})

describe('PATCH /boards/:id', () => {
  it('C7: a new prefix holds only for the tasks created after', async () => {
    const casa = (await createBoard({ name: 'Casa', prefix: 'CASA' })).json()
    for (const title of ['um', 'dois', 'três']) await createTask({ boardId: casa.id, title, statusId: await todoOf(casa.id) })

    const patched = await patchBoard(casa.id, { prefix: 'LAR' })
    const fourth = await createTask({ boardId: casa.id, title: 'Pintar a sala', statusId: await todoOf(casa.id) })

    expect(patched.statusCode).toBe(200)
    expect(patched.json()).toEqual({ ...casa, prefix: 'LAR' })
    expect(fourth.json()).toMatchObject({ keyPrefix: 'LAR', key: 4 })
    expect(keys(await read(casa.id)).sort()).toEqual(['CASA-1', 'CASA-2', 'CASA-3', 'LAR-4'])
    expect((await app.inject({ method: 'PATCH', url: '/tasks/CASA-2', payload: { title: 'x' } })).statusCode).toBe(200)
  })

  it('C8: a prefix a board left stays reserved, with 409', async () => {
    const casa = (await createBoard({ name: 'Casa', prefix: 'CASA' })).json()
    await patchBoard(casa.id, { prefix: 'LAR' })

    const response = await createBoard({ name: 'Casinha', prefix: 'CASA' })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({ error: 'o prefixo CASA já foi usado por um board' })
    expect(await boards()).toHaveLength(2)
  })

  it('renames, refuses what is not name or prefix, and answers 404 for an unknown id', async () => {
    const casa = (await createBoard({ name: 'Casa', prefix: 'CASA' })).json()

    expect((await patchBoard(casa.id, { name: 'Lar' })).json()).toEqual({ ...casa, name: 'Lar' })
    expect((await patchBoard(casa.id, { name: '' })).json()).toEqual({
      errors: [{ field: 'name', message: 'o nome é obrigatório' }],
    })
    expect((await patchBoard(casa.id, { prefix: 'T' })).statusCode).toBe(409)
    expect((await patchBoard(casa.id, { color: 'red' })).statusCode).toBe(400)
    expect((await patchBoard(casa.id, {})).statusCode).toBe(400)
    const missing = await patchBoard('nope', { name: 'x' })
    expect(missing.statusCode).toBe(404)
    expect(missing.json()).toEqual({ error: 'board não encontrado' })
  })
})

describe('/tasks with boards', () => {
  it('C4: each board reads only its own tasks', async () => {
    const casa = (await createBoard({ name: 'Casa', prefix: 'CASA' })).json()
    await createTask({ boardId: 'tasks', title: 'Pagar o condomínio', statusId: 'todo' })
    await createTask({ boardId: casa.id, title: 'Trocar a lâmpada', statusId: await todoOf(casa.id) })

    const board = await read(casa.id)
    expect(board.tasks.map((task: { title: string }) => task.title)).toEqual(['Trocar a lâmpada'])
    expect(board.tasks[0]).toMatchObject({ boardId: casa.id, keyPrefix: 'CASA', key: 1 })
    expect(keys(await read('tasks'))).toEqual(['T-1'])
  })

  it('C6: the key is sequential inside the board', async () => {
    const casa = (await createBoard({ name: 'Casa', prefix: 'CASA' })).json()
    for (let n = 0; n < 7; n += 1) await createTask({ boardId: 'tasks', title: `t${n}`, statusId: 'todo' })
    await createTask({ boardId: casa.id, title: 'um', statusId: await todoOf(casa.id) })
    await createTask({ boardId: casa.id, title: 'dois', statusId: await todoOf(casa.id) })

    const third = await createTask({ boardId: casa.id, title: 'Comprar tinta', statusId: await todoOf(casa.id) })

    expect(third.statusCode).toBe(201)
    expect(third.json()).toMatchObject({ keyPrefix: 'CASA', key: 3 })
    expect((await read(casa.id)).tasks[0].title).toBe('Comprar tinta')
  })

  it('answers 400 naming boardId when GET or POST comes without it, with no hidden default board', async () => {
    const listed = await app.inject({ method: 'GET', url: '/tasks' })
    expect(listed.statusCode).toBe(400)
    expect(listed.json().errors[0].field).toBe('boardId')

    const created = await createTask({ title: 'x', statusId: 'todo' })
    expect(created.statusCode).toBe(400)
    expect(created.json().errors[0].field).toBe('boardId')
  })

  it('answers 404 "board não encontrado" for an unknown boardId', async () => {
    const listed = await app.inject({ method: 'GET', url: '/tasks?boardId=nope' })
    expect(listed.statusCode).toBe(404)
    expect(listed.json()).toEqual({ error: 'board não encontrado' })
    expect((await createTask({ boardId: 'nope', title: 'x', statusId: 'todo' })).statusCode).toBe(404)
  })

  it('finds a task by its whole key, and not by the number with another prefix', async () => {
    await createBoard({ name: 'Casa', prefix: 'CASA' })
    await createTask({ boardId: 'tasks', title: 'um', statusId: 'todo' })

    expect((await app.inject({ method: 'PATCH', url: '/tasks/CASA-1', payload: { title: 'x' } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'DELETE', url: '/tasks/CASA-1' })).statusCode).toBe(404)
    expect((await app.inject({ method: 'DELETE', url: '/tasks/T-1' })).statusCode).toBe(204)
  })
})

describe('C9: the tasks from before the v2 stay in the "Tasks" board (RN10, RN5)', () => {
  it('keeps T-1 in "Fazendo" and T-2 in "Feito", and the next task is T-10', async () => {
    // A file as v0.1.14 left it: the schema up to migration 7, written by
    // hand the way the v1 store wrote it, T-9 created and then deleted.
    const db = openDatabase(
      ':memory:',
      MIGRATIONS.filter((migration) => migration.version <= 7),
    )
    const at = '2026-11-01T12:00:00.000Z'
    const entry = db.prepare(
      `INSERT INTO entries (id, kind, body, occurred_at, created_at, updated_at) VALUES (?, 'task', '', ?, ?, ?)`,
    )
    entry.run('e1', at, at, at)
    entry.run('e2', at, at, at)
    db.prepare(
      `INSERT INTO tasks (entry_id, key, title, status_id, priority, rank, completed_at) VALUES
         ('e1', 1, 'Pagar o condomínio', 'doing', 2, 'i', NULL),
         ('e2', 2, 'Trocar a lâmpada', 'done', 0, 'i', ?)`,
    ).run(at)
    db.prepare('UPDATE task_counter SET last_key = 9').run()

    migrate(db)
    app = buildApp({ db, zone: UTC })

    expect(await boards()).toEqual([{ id: 'tasks', name: 'Tasks', prefix: 'T' }])
    const before = (await read('tasks')).tasks
    expect(before.map((task: { keyPrefix: string; key: number; statusId: string }) => [`${task.keyPrefix}-${task.key}`, task.statusId])).toEqual([
      ['T-1', 'doing'],
      ['T-2', 'done'],
    ])
    expect(before[0]).toMatchObject({ id: 'e1', title: 'Pagar o condomínio', priority: 2, boardId: 'tasks' })
    expect(before[1].completedAt).toBe(at)
    const next = await createTask({ boardId: 'tasks', title: 'Nova', statusId: 'todo' })
    expect(next.json()).toMatchObject({ keyPrefix: 'T', key: 10 })
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'task_counter'").get()).toBeUndefined()
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
})
