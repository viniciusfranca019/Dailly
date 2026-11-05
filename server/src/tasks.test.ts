import { UTC } from '@dailly/periods'
import { beforeEach, describe, expect, it } from 'vitest'
import { sqliteEntryRepository } from './adapters/sqlite-entry-repository.js'
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
  app = buildApp({ db, zone: UTC, entries: sqliteEntryRepository({ db, zone: UTC }) })
})

const create = (payload: unknown) => app.inject({ method: 'POST', url: '/tasks', payload: payload as object })
const board = async () => (await app.inject({ method: 'GET', url: '/tasks' })).json()

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
    for (const payload of [[], { title: 3, statusId: 'todo' }, { title: 'x' }]) {
      expect((await create(payload)).statusCode).toBe(400)
    }
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
