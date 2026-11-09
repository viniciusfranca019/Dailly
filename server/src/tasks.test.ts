import { UTC } from '@dailly/periods'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './shell/app.js'
import { openDatabase } from './shell/database.js'

/**
 * The Tasks module over HTTP, with the real manifest and a real SQLite.
 *
 * It lives at the root of `src/` because it builds the whole app, which the
 * boundary rule keeps out of a module. The entries repository is the SQLite
 * one on the same file, since C7 is about the two modules sharing `entries`.
 */
let app: ReturnType<typeof buildApp>

beforeEach(() => {
  const db = openDatabase(':memory:')
  app = buildApp({ db, zone: UTC })
})

const create = (payload: unknown) =>
  app.inject({ method: 'POST', url: '/tasks', payload: { boardId: 'tasks', ...(payload as object) } })
const board = async () => (await app.inject({ method: 'GET', url: '/tasks?boardId=tasks' })).json()

describe('GET /tasks', () => {
  it('answers the five statuses and no task on a new file', async () => {
    const answer = await board()
    expect(answer.statuses.map((status: { name: string }) => status.name)).toEqual([
      'Backlog',
      'A fazer',
      'Fazendo',
      'Feito',
      'Cancelado',
    ])
    expect(answer.tasks).toEqual([])
  })

  it('C1: gives each task with its status, in the order of the statuses', async () => {
    await create({ title: 'Ligar pro banco', statusId: 'doing' })
    await create({ title: 'Comprar café', statusId: 'todo' })

    const { tasks } = await board()
    expect(tasks.map((task: { title: string; statusId: string }) => [task.title, task.statusId])).toEqual([
      ['Comprar café', 'todo'],
      ['Ligar pro banco', 'doing'],
    ])
  })
})

describe('POST /tasks', () => {
  it('C3: creates on top of its status, with the next key and priority "sem"', async () => {
    await create({ title: 'Primeira', statusId: 'todo' })
    const response = await create({ title: 'Comprar café', statusId: 'todo' })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({ key: 2, title: 'Comprar café', statusId: 'todo', priority: 0 })
    expect((await board()).tasks[0].title).toBe('Comprar café')
  })

  it('#48 C3: creates with the priority chosen in the quick create', async () => {
    const response = await create({ title: 'Comprar tinta', statusId: 'todo', priority: 2 })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({ key: 1, title: 'Comprar tinta', priority: 2 })
    expect((await board()).tasks[0].priority).toBe(2)
  })

  it('#48: refuses a priority that is not 0 to 4, naming the field, as the PATCH does, and writes nothing', async () => {
    for (const priority of [7, -1, 1.5, 'alta', null]) {
      const response = await create({ title: 'x', statusId: 'todo', priority })
      expect(response.statusCode, JSON.stringify(priority)).toBe(400)
      expect(response.json().errors[0].field).toBe('priority')
    }
    expect((await board()).tasks).toEqual([])
  })

  it('C5: refuses an empty title or one of spaces, and writes nothing', async () => {
    for (const title of ['', '   ']) {
      const response = await create({ title, statusId: 'todo' })
      expect(response.statusCode).toBe(400)
      expect(response.json()).toEqual({ errors: [{ field: 'title', message: 'o título é obrigatório' }] })
    }
    expect((await board()).tasks).toEqual([])
  })

  it('refuses a status that does not exist, naming the field', async () => {
    const response = await create({ title: 'x', statusId: 'nope' })
    expect(response.statusCode).toBe(400)
    expect(response.json().errors[0].field).toBe('statusId')
  })

  it('refuses a body that is not an object with a text title and status', async () => {
    for (const payload of [{ title: 3, statusId: 'todo' }, { title: 'x' }]) {
      expect((await create(payload)).statusCode).toBe(400)
    }
    // Not through `create`, which would spread the array into an object.
    expect((await app.inject({ method: 'POST', url: '/tasks', payload: [] as unknown as object })).statusCode).toBe(400)
  })
})

describe('DELETE /tasks/:key', () => {
  it('C4: a deleted key is never handed out again (RN5)', async () => {
    await create({ title: 'um', statusId: 'todo' })
    await create({ title: 'dois', statusId: 'todo' })

    const deleted = await app.inject({ method: 'DELETE', url: '/tasks/T-2' })
    const third = await create({ title: 'três', statusId: 'todo' })

    expect(deleted.statusCode).toBe(204)
    expect(third.json().key).toBe(3)
  })

  it('answers 404 for a key that does not exist or is not a key', async () => {
    expect((await app.inject({ method: 'DELETE', url: '/tasks/T-9' })).statusCode).toBe(404)
    expect((await app.inject({ method: 'DELETE', url: '/tasks/abc' })).statusCode).toBe(404)
  })
})

describe('C7: a task stays out of the Daily Log timeline (RN6)', () => {
  it('GET /entries lists only the day log, not the task created the same day', async () => {
    const at = new Date().toISOString()
    await create({ title: 'Comprar café', statusId: 'todo' })
    await app.inject({
      method: 'POST',
      url: '/entries',
      payload: {
        id: '11111111-1111-4111-8111-111111111111',
        body: 'Registro do dia',
        occurredAt: at,
        createdAt: at,
        updatedAt: at,
      },
    })

    const listed = (await app.inject({ method: 'GET', url: '/entries' })).json()
    expect(listed.map((entry: { body: string }) => entry.body)).toEqual(['Registro do dia'])
  })
})

describe('PATCH /tasks/:key', () => {
  const move = (key: string, payload: unknown) =>
    app.inject({ method: 'PATCH', url: `/tasks/${key}`, payload: payload as object })

  it('C1: puts the task in the new status at the rank sent, and the board reads it there', async () => {
    await create({ title: 'um', statusId: 'todo' })
    await create({ title: 'dois', statusId: 'doing' })

    const response = await move('T-1', { statusId: 'doing', rank: 'z' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ key: 1, statusId: 'doing', rank: 'z' })
    expect((await board()).tasks.map((task: { key: number }) => task.key)).toEqual([2, 1])
  })

  it('C3: stamps completedAt on entering "Feito" and clears it on leaving (RN3)', async () => {
    await create({ title: 'um', statusId: 'doing' })

    expect((await move('T-1', { statusId: 'done', rank: 'i' })).json().completedAt).toEqual(expect.any(String))
    expect((await move('T-1', { statusId: 'doing', rank: 'i' })).json().completedAt).toBeNull()
  })

  it('refuses an unknown status or a malformed rank, naming the field', async () => {
    await create({ title: 'um', statusId: 'todo' })

    expect((await move('T-1', { statusId: 'nope', rank: 'i' })).json().errors[0].field).toBe('statusId')
    expect((await move('T-1', { statusId: 'doing', rank: 'a0' })).json().errors[0].field).toBe('rank')
    expect((await move('T-1', { statusId: 'doing' })).statusCode).toBe(400)
  })

  it('answers 404 for a key that does not exist', async () => {
    expect((await move('T-9', { statusId: 'todo', rank: 'i' })).statusCode).toBe(404)
  })
})

describe('PATCH /tasks/:key, from the panel (card #22)', () => {
  const patch = (key: string, payload: unknown) =>
    app.inject({ method: 'PATCH', url: `/tasks/${key}`, payload: payload as object })

  it('C2: saves the title, the priority and the body, and the board reads them back', async () => {
    await create({ title: 'um', statusId: 'todo' })

    const response = await patch('T-1', { title: 'Comprar café especial', priority: 2, body: '- moído fino' })

    expect(response.statusCode).toBe(200)
    expect((await board()).tasks[0]).toMatchObject({
      title: 'Comprar café especial',
      priority: 2,
      body: '- moído fino',
      statusId: 'todo',
    })
  })

  it('C3: refuses an erased title, naming the field, and keeps the old one', async () => {
    await create({ title: 'um', statusId: 'todo' })

    const response = await patch('T-1', { title: '  ' })

    expect(response.statusCode).toBe(400)
    expect(response.json().errors[0]).toEqual({ field: 'title', message: 'o título é obrigatório' })
    expect((await board()).tasks[0].title).toBe('um')
  })

  it('refuses a priority outside 0 to 4, a body that is not text, and a status without a rank', async () => {
    await create({ title: 'um', statusId: 'todo' })

    expect((await patch('T-1', { priority: 9 })).json().errors[0].field).toBe('priority')
    expect((await patch('T-1', { body: 3 })).statusCode).toBe(400)
    expect((await patch('T-1', { statusId: 'doing' })).statusCode).toBe(400)
  })

  it('C6: answers 404 for a task deleted while its panel was open', async () => {
    await create({ title: 'um', statusId: 'todo' })
    await app.inject({ method: 'DELETE', url: '/tasks/T-1' })

    expect((await patch('T-1', { title: 'x' })).statusCode).toBe(404)
  })
})

describe('gate #22: PATCH recusa o que não conhece', () => {
  it('answers 400 to an unknown field or an empty body, and touches nothing', async () => {
    await create({ title: 'um', statusId: 'todo' })
    const before = (await board()).tasks[0]

    for (const payload of [{ completedAt: null }, { assignee: 'x' }, {}]) {
      const response = await app.inject({ method: 'PATCH', url: '/tasks/T-1', payload })
      expect(response.statusCode).toBe(400)
    }
    expect((await app.inject({ method: 'PATCH', url: '/tasks/T-1', payload: { assignee: 'x' } })).json().errors[0].field).toBe('assignee')
    expect((await board()).tasks[0]).toEqual(before)
  })
})
