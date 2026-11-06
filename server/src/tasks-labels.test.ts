import { UTC } from '@dailly/periods'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './shell/app.js'
import { openDatabase } from './shell/database.js'

/** The labels of a task over HTTP (card #46, F8): the global labels of the Daily Log (RN13). */
let app: ReturnType<typeof buildApp>
let trabalho: { id: string }

beforeEach(async () => {
  app = buildApp({ db: openDatabase(':memory:'), zone: UTC })
  trabalho = (await app.inject({ method: 'POST', url: '/labels', payload: { name: 'trabalho', color: 'blue' } })).json()
  await app.inject({ method: 'POST', url: '/tasks', payload: { boardId: 'tasks', title: 'um', statusId: 'todo' } })
})

const patch = (payload: unknown) => app.inject({ method: 'PATCH', url: '/tasks/T-1', payload: payload as object })
const task = async () => (await app.inject({ method: 'GET', url: '/tasks?boardId=tasks' })).json().tasks[0]

describe('PATCH /tasks/:key with labelIds', () => {
  it('C1: applies the label, and GET /tasks gives it back with the task', async () => {
    expect((await task()).labelIds).toEqual([])

    const response = await patch({ labelIds: [trabalho.id] })

    expect(response.statusCode).toBe(200)
    expect(response.json().labelIds).toEqual([trabalho.id])
    expect((await task()).labelIds).toEqual([trabalho.id])
  })

  it('C6: takes it off, and the label stays in the list', async () => {
    await patch({ labelIds: [trabalho.id] })

    expect((await patch({ labelIds: [] })).json().labelIds).toEqual([])
    expect((await task()).labelIds).toEqual([])
    expect((await app.inject({ method: 'GET', url: '/labels' })).json().map((label: { name: string }) => label.name)).toEqual(['trabalho'])
  })

  it('C7: refuses a label that does not exist with 400, and the task keeps its labels', async () => {
    await patch({ labelIds: [trabalho.id] })

    const response = await patch({ labelIds: ['nao-existe'] })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ errors: [{ field: 'labelIds', message: 'contém uma label que não existe' }] })
    expect((await task()).labelIds).toEqual([trabalho.id])
  })

  it('refuses labelIds that is not a list of text', async () => {
    for (const labelIds of ['x', [3], null]) {
      const response = await patch({ labelIds })
      expect(response.statusCode).toBe(400)
      expect(response.json().errors[0].field).toBe('labelIds')
    }
  })

  it('C3: the label applied to a task is the one the Daily Log lists and can put on an entry (RN13)', async () => {
    await patch({ labelIds: [trabalho.id] })
    const at = new Date().toISOString()
    const entry = await app.inject({
      method: 'POST',
      url: '/entries',
      payload: { id: '11111111-1111-4111-8111-111111111111', body: 'registro', occurredAt: at, createdAt: at, updatedAt: at, labelIds: [trabalho.id] },
    })

    expect(entry.statusCode).toBe(201)
    const listed = (await app.inject({ method: 'GET', url: '/entries' })).json()
    expect(listed[0].labelIds).toEqual([trabalho.id])
  })

  it('a label deleted goes off the task too', async () => {
    await patch({ labelIds: [trabalho.id] })
    await app.inject({ method: 'DELETE', url: `/labels/${trabalho.id}` })

    expect((await task()).labelIds).toEqual([])
  })
})
