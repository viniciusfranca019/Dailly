import { describe, expect, it } from 'vitest'
import { ApiError, ApiUnreachableError } from './errors.js'
import { httpTasksClient } from './http-tasks-client.js'

const config = { baseUrl: '/api' }
const task = {
  id: 'id-1',
  key: 1,
  title: 'Comprar café',
  statusId: 'todo',
  priority: 0,
  rank: 'i',
  completedAt: null,
  createdAt: '2026-11-05T12:00:00.000Z',
  body: '',
}
const status = { id: 'todo', name: 'A fazer', category: 'unstarted', position: 1 }

const answering = (status_: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}) =>
  (async (url: string, init?: RequestInit) => {
    seen.url = url
    seen.init = init
    return new Response(JSON.stringify(body), { status: status_ })
  }) as unknown as typeof fetch

describe('httpTasksClient', () => {
  it('reads the board', async () => {
    const client = httpTasksClient({ config, fetch: answering(200, { statuses: [status], tasks: [task] }) })
    expect(await client.board()).toEqual({ statuses: [status], tasks: [task] })
  })

  it('posts title and status, and gives back the created task', async () => {
    const seen: { url?: string; init?: RequestInit } = {}
    const client = httpTasksClient({ config, fetch: answering(201, task, seen) })

    expect(await client.create({ title: 'Comprar café', statusId: 'todo' })).toEqual(task)
    expect(seen.url).toBe('/api/tasks')
    expect(seen.init?.method).toBe('POST')
    expect(JSON.parse(seen.init?.body as string)).toEqual({ title: 'Comprar café', statusId: 'todo' })
  })

  it('refuses a board in a shape it does not know, at the boundary', async () => {
    const client = httpTasksClient({ config, fetch: answering(200, { statuses: [status], tasks: [{ ...task, key: '1' }] }) })
    await expect(client.board()).rejects.toThrow(ApiError)
  })

  it('carries the refusal of the server as its message', async () => {
    const client = httpTasksClient({
      config,
      fetch: answering(400, { errors: [{ field: 'title', message: 'o título é obrigatório' }] }),
    })
    await expect(client.create({ title: ' ', statusId: 'todo' })).rejects.toThrow('o título é obrigatório')
  })

  it('says nobody answered when the API is down (C6)', async () => {
    const client = httpTasksClient({
      config,
      fetch: (async () => {
        throw new TypeError('fetch failed')
      }) as unknown as typeof fetch,
    })
    await expect(client.create({ title: 'x', statusId: 'todo' })).rejects.toThrow(ApiUnreachableError)
  })
})
