import { uuidIds } from '@dailly/domain'
import { UTC } from '@dailly/periods'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './shell/app.js'
import { openDatabase } from './shell/database.js'

/**
 * Card #33 over HTTP: read one entry, correct it, delete it. The renderer's
 * `updateEntry` builds the patch; the API stores it and guards the store.
 */
let app: ReturnType<typeof buildApp>
beforeEach(() => {
  app = buildApp({ db: openDatabase(':memory:'), zone: UTC })
})

const anEntry = () => {
  const at = '2026-07-24T10:00:00.000Z'
  return { id: uuidIds.next(), body: 'Reunião com o time', occurredAt: at, createdAt: at, updatedAt: at, labelIds: [], props: {} }
}
const post = async () => {
  const entry = anEntry()
  await app.inject({ method: 'POST', url: '/entries', payload: entry })
  return entry
}

describe('GET /entries/:id', () => {
  it('answers the entry', async () => {
    const entry = await post()
    const response = await app.inject({ method: 'GET', url: `/entries/${entry.id}` })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(entry)
  })

  it('answers 404 for an unknown id', async () => {
    const response = await app.inject({ method: 'GET', url: `/entries/${uuidIds.next()}` })
    expect(response.statusCode).toBe(404)
    expect(response.json().error).toBe('registro não encontrado')
  })
})

describe('PATCH /entries/:id', () => {
  it('C2, C3: stores the corrected body and instant, keeping id and creation', async () => {
    const entry = await post()
    const patch = { body: 'Reunião com o time de dados', occurredAt: '2026-07-23T12:00:00.000Z', updatedAt: '2026-07-24T15:00:00.000Z' }

    const response = await app.inject({ method: 'PATCH', url: `/entries/${entry.id}`, payload: patch })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ...entry, ...patch })
    expect((await app.inject({ method: 'GET', url: '/entries' })).json()).toEqual([{ ...entry, ...patch }])
  })

  it('C4: refuses an empty body with 400 naming the field, and keeps the entry', async () => {
    const entry = await post()
    const response = await app.inject({
      method: 'PATCH',
      url: `/entries/${entry.id}`,
      payload: { body: '  ', updatedAt: '2026-07-24T15:00:00.000Z' },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().errors[0].field).toBe('body')
    expect((await app.inject({ method: 'GET', url: `/entries/${entry.id}` })).json()).toEqual(entry)
  })

  it('refuses a field it does not change, and a patch without the update stamp', async () => {
    const entry = await post()
    const id = await app.inject({ method: 'PATCH', url: `/entries/${entry.id}`, payload: { id: 'x', updatedAt: '2026-07-24T15:00:00.000Z' } })
    const stamp = await app.inject({ method: 'PATCH', url: `/entries/${entry.id}`, payload: { body: 'ok' } })
    expect(id.statusCode).toBe(400)
    expect(stamp.statusCode).toBe(400)
  })

  it('C6: answers 404 for an entry deleted meanwhile', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/entries/${uuidIds.next()}`,
      payload: { body: 'x', updatedAt: '2026-07-24T15:00:00.000Z' },
    })
    expect(response.statusCode).toBe(404)
    expect(response.json().error).toBe('registro não encontrado')
  })
})

describe('DELETE /entries/:id', () => {
  it('C7: removes the entry', async () => {
    const entry = await post()
    const response = await app.inject({ method: 'DELETE', url: `/entries/${entry.id}` })
    expect(response.statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url: '/entries' })).json()).toEqual([])
  })

  it('answers 404 for an unknown id', async () => {
    const response = await app.inject({ method: 'DELETE', url: `/entries/${uuidIds.next()}` })
    expect(response.statusCode).toBe(404)
  })
})

describe('C9: a task is not edited nor deleted through /entries (RN6)', () => {
  it('answers 404 to GET, PATCH and DELETE on the Entry of a task, and the task stays', async () => {
    const created = await app.inject({ method: 'POST', url: '/tasks', payload: { title: 'Comprar café', statusId: 'todo' } })
    const board = (await app.inject({ method: 'GET', url: '/tasks' })).json()
    // A task's id is the id of its Entry (Tasks RN1).
    const id = board.tasks[0].id
    expect(created.statusCode).toBe(201)

    const get = await app.inject({ method: 'GET', url: `/entries/${id}` })
    const patch = await app.inject({ method: 'PATCH', url: `/entries/${id}`, payload: { body: 'x', updatedAt: '2026-07-24T15:00:00.000Z' } })
    const del = await app.inject({ method: 'DELETE', url: `/entries/${id}` })

    expect([get.statusCode, patch.statusCode, del.statusCode]).toEqual([404, 404, 404])
    expect((await app.inject({ method: 'GET', url: '/tasks' })).json().tasks).toHaveLength(1)
  })
})
