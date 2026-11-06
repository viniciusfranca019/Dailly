import { UTC } from '@dailly/periods'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './shell/app.js'
import { openDatabase } from './shell/database.js'
import { MIGRATIONS, migrate } from './shell/migrations.js'

/**
 * The statuses of a board over HTTP (card #43, F5), with the real manifest
 * and a real SQLite. At the root of `src/` because it builds the whole app.
 */
let app: ReturnType<typeof buildApp>
let casa: { id: string }

beforeEach(async () => {
  app = buildApp({ db: openDatabase(':memory:'), zone: UTC })
  casa = (await app.inject({ method: 'POST', url: '/boards', payload: { name: 'Casa', prefix: 'CASA' } })).json()
})

interface Status {
  id: string
  name: string
  color: string
  category: string
  boardId: string
  position: number
}
const statuses = async (boardId = casa.id): Promise<Status[]> =>
  (await app.inject({ method: 'GET', url: `/tasks?boardId=${boardId}` })).json().statuses
const named = async (name: string, boardId = casa.id) => (await statuses(boardId)).find((status) => status.name === name)!
const add = (payload: unknown, boardId = casa.id) =>
  app.inject({ method: 'POST', url: `/boards/${boardId}/statuses`, payload: payload as object })
const createTask = async (title: string, statusId: string) =>
  (await app.inject({ method: 'POST', url: '/tasks', payload: { boardId: casa.id, title, statusId } })).json()

describe('POST /boards/:id/statuses', () => {
  it('C1: answers 201, and the status sits after "Fazendo" and before "Feito", with its color', async () => {
    const response = await add({ name: 'Revisão', category: 'started', color: 'purple' })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({ name: 'Revisão', category: 'started', color: 'purple', boardId: casa.id })
    expect((await statuses()).map((status) => status.name)).toEqual([
      'Backlog',
      'A fazer',
      'Fazendo',
      'Revisão',
      'Feito',
      'Cancelado',
    ])
  })

  it('C2: refuses an empty name with 400 and a name taken in the board with 409', async () => {
    const empty = await add({ name: '', category: 'started', color: 'purple' })
    expect(empty.statusCode).toBe(400)
    expect(empty.json()).toEqual({ errors: [{ field: 'name', message: 'o nome é obrigatório' }] })

    const taken = await add({ name: 'Feito', category: 'completed', color: 'blue' })
    expect(taken.statusCode).toBe(409)
    expect(taken.json()).toEqual({ error: 'já existe um status "Feito" neste board' })
    expect(await statuses()).toHaveLength(5)
  })

  it('refuses a color outside the palette, an unknown category or an extra field with 400, and an unknown board with 404', async () => {
    expect((await add({ name: 'x', category: 'started', color: 'magenta' })).json().errors[0].field).toBe('color')
    expect((await add({ name: 'x', category: 'review', color: 'purple' })).json().errors[0].field).toBe('category')
    expect((await add({ name: 'x', category: 'started', color: 'purple', position: 2 })).statusCode).toBe(400)
    const missing = await add({ name: 'x', category: 'started', color: 'purple' }, 'nope')
    expect(missing.statusCode).toBe(404)
    expect(missing.json()).toEqual({ error: 'board não encontrado' })
    expect(await statuses()).toHaveLength(5)
  })

  it('C3: a board created after has only the five, and "Casa" keeps "Revisão"', async () => {
    await add({ name: 'Revisão', category: 'started', color: 'purple' })
    const lar = (await app.inject({ method: 'POST', url: '/boards', payload: { name: 'Lar', prefix: 'LAR' } })).json()

    expect((await statuses(lar.id)).map((status) => status.name)).toEqual(['Backlog', 'A fazer', 'Fazendo', 'Feito', 'Cancelado'])
    expect((await statuses()).map((status) => status.name)).toContain('Revisão')
  })
})

describe('PATCH /statuses/:id', () => {
  it('C4: renames and recolors, and the task in it keeps its "concluída em"', async () => {
    const done = await named('Feito')
    const task = await createTask('um', done.id)
    const before = (await app.inject({ method: 'GET', url: `/tasks?boardId=${casa.id}` })).json().tasks

    const response = await app.inject({ method: 'PATCH', url: `/statuses/${done.id}`, payload: { name: 'Entregue', color: 'green' } })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ id: done.id, name: 'Entregue', color: 'green', category: 'completed' })
    expect((await app.inject({ method: 'GET', url: `/tasks?boardId=${casa.id}` })).json().tasks).toEqual(before)
    expect(task.statusId).toBe(done.id)
  })

  it('refuses the category, an empty body, a taken name and an unknown id', async () => {
    const done = await named('Feito')
    const patch = (id: string, payload: unknown) =>
      app.inject({ method: 'PATCH', url: `/statuses/${id}`, payload: payload as object })

    expect((await patch(done.id, { category: 'started' })).statusCode).toBe(400)
    expect((await patch(done.id, {})).statusCode).toBe(400)
    expect((await patch(done.id, { name: 'Fazendo' })).statusCode).toBe(409)
    expect((await patch(done.id, { color: 'magenta' })).json().errors[0].field).toBe('color')
    const missing = await patch('nope', { name: 'x' })
    expect(missing.statusCode).toBe(404)
    expect(missing.json()).toEqual({ error: 'status não encontrado' })
  })
})

describe('DELETE /statuses/:id', () => {
  const remove = (id: string, moveTo?: string) =>
    app.inject({ method: 'DELETE', url: `/statuses/${id}${moveTo === undefined ? '' : `?moveTo=${moveTo}`}` })

  it('C5: deletes a status with no task', async () => {
    const review = (await add({ name: 'Revisão', category: 'started', color: 'purple' })).json()

    expect((await remove(review.id)).statusCode).toBe(204)
    expect((await statuses()).map((status) => status.name)).not.toContain('Revisão')
    expect((await remove(review.id)).statusCode).toBe(404)
  })

  it('C6: refuses the last status of the board with 409', async () => {
    for (const status of await statuses()) if (status.name !== 'A fazer') await remove(status.id)

    const response = await remove((await named('A fazer')).id)

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({ error: 'o board precisa de ao menos um status' })
    expect((await statuses()).map((status) => status.name)).toEqual(['A fazer'])
  })

  it('C7: moves the tasks on top of the destination, in their order, stamped (RN12, RN3)', async () => {
    const review = (await add({ name: 'Revisão', category: 'started', color: 'purple' })).json()
    const done = await named('Feito')
    await createTask('três', done.id)
    await createTask('dois', review.id)
    await createTask('um', review.id)

    expect((await remove(review.id, done.id)).statusCode).toBe(204)

    const { tasks } = (await app.inject({ method: 'GET', url: `/tasks?boardId=${casa.id}` })).json()
    expect(tasks.map((task: { title: string; statusId: string; completedAt: string | null }) => [task.title, task.statusId === done.id, task.completedAt !== null])).toEqual([
      ['um', true, true],
      ['dois', true, true],
      ['três', true, false],
    ])
  })

  it('C9: answers 409 to a status with tasks and no moveTo, and keeps it with its task', async () => {
    const review = (await add({ name: 'Revisão', category: 'started', color: 'purple' })).json()
    await createTask('um', review.id)

    const response = await remove(review.id)

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({ error: 'o status tem tarefas: escolha para onde elas vão' })
    expect((await statuses()).map((status) => status.name)).toContain('Revisão')
    expect((await app.inject({ method: 'GET', url: `/tasks?boardId=${casa.id}` })).json().tasks[0].statusId).toBe(review.id)
  })

  it('refuses moveTo itself, of another board or unknown with 400 naming moveTo', async () => {
    const review = (await add({ name: 'Revisão', category: 'started', color: 'purple' })).json()
    await createTask('um', review.id)

    for (const moveTo of [review.id, 'todo', 'nope']) {
      const response = await remove(review.id, moveTo)
      expect(response.statusCode).toBe(400)
      expect(response.json().errors[0].field).toBe('moveTo')
    }
  })
})

describe('/tasks keeps each task in a status of its own board', () => {
  it('refuses to create in, or move to, a status of another board', async () => {
    const response = await app.inject({ method: 'POST', url: '/tasks', payload: { boardId: casa.id, title: 'x', statusId: 'todo' } })
    expect(response.statusCode).toBe(400)
    expect(response.json().errors[0].field).toBe('statusId')
  })
})

describe('migration 10: the statuses go into each board (RN10, RN11)', () => {
  it('keeps the v1 ids in "Tasks", seeds "Casa" with its own, and moves no task', async () => {
    // A file as v0.1.18 left it: boards (8) and comments (9), "Casa" with a task.
    const db = openDatabase(':memory:', MIGRATIONS.filter((migration) => migration.version <= 9))
    const at = '2026-11-03T12:00:00.000Z'
    db.prepare(`INSERT INTO task_boards (id, name, prefix, counter, created_at) VALUES ('casa', 'Casa', 'CASA', 3, ?)`).run(at)
    db.prepare(`INSERT INTO task_board_prefixes (prefix, board_id) VALUES ('CASA', 'casa')`).run()
    const entry = db.prepare(`INSERT INTO entries (id, kind, body, occurred_at, created_at, updated_at) VALUES (?, 'task', '', ?, ?, ?)`)
    entry.run('e1', at, at, at)
    entry.run('e2', at, at, at)
    db.prepare(
      `INSERT INTO tasks (entry_id, board_id, key, key_prefix, title, status_id, priority, rank, completed_at) VALUES
         ('e1', 'tasks', 1, 'T', 'Pagar o condomínio', 'doing', 0, 'i', NULL),
         ('e2', 'casa', 3, 'CASA', 'Trocar a lâmpada', 'done', 1, 'm', ?)`,
    ).run(at)
    db.prepare(`INSERT INTO task_comments (id, entry_id, body, created_at) VALUES ('c1', 'e2', 'ele vem quinta', ?)`).run(at)

    migrate(db)
    app = buildApp({ db, zone: UTC })

    const tasksBoard = await statuses('tasks')
    expect(tasksBoard.map((status) => [status.id, status.name, status.color])).toEqual([
      ['backlog', 'Backlog', 'gray'],
      ['todo', 'A fazer', 'gray'],
      ['doing', 'Fazendo', 'yellow'],
      ['done', 'Feito', 'blue'],
      ['canceled', 'Cancelado', 'gray'],
    ])
    const casaBoard = await statuses('casa')
    expect(casaBoard.map((status) => status.name)).toEqual(['Backlog', 'A fazer', 'Fazendo', 'Feito', 'Cancelado'])
    expect(casaBoard.every((status) => status.boardId === 'casa' && !['backlog', 'todo', 'doing', 'done', 'canceled'].includes(status.id))).toBe(true)

    const [moved] = (await app.inject({ method: 'GET', url: '/tasks?boardId=casa' })).json().tasks
    expect(moved).toMatchObject({ keyPrefix: 'CASA', key: 3, rank: 'm', completedAt: at, priority: 1 })
    expect(moved.statusId).toBe(casaBoard.find((status) => status.name === 'Feito')!.id)
    expect((await app.inject({ method: 'GET', url: '/tasks?boardId=tasks' })).json().tasks[0]).toMatchObject({ statusId: 'doing', key: 1 })
    expect((await app.inject({ method: 'GET', url: '/tasks/CASA-3/comments' })).json()).toHaveLength(1)
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
})
