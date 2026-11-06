import { describe, expect, it } from 'vitest'
import { ApiError, ApiUnreachableError } from './errors.js'
import { httpTasksClient } from './http-tasks-client.js'

const config = { baseUrl: '/api' }
const task = {
  id: 'id-1',
  boardId: 'casa',
  key: 1,
  keyPrefix: 'CASA',
  title: 'Comprar café',
  statusId: 'todo',
  priority: 0,
  rank: 'i',
  completedAt: null,
  createdAt: '2026-11-05T12:00:00.000Z',
  body: '',
}
const status = { id: 'todo', name: 'A fazer', category: 'unstarted', position: 1 }
const board = { id: 'casa', name: 'Casa', prefix: 'CASA' }

const answering = (status_: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}) =>
  (async (url: string, init?: RequestInit) => {
    seen.url = url
    seen.init = init
    return new Response(JSON.stringify(body), { status: status_ })
  }) as unknown as typeof fetch

describe('httpTasksClient', () => {
  it('reads one board, by its id', async () => {
    const seen: { url?: string; init?: RequestInit } = {}
    const client = httpTasksClient({ config, fetch: answering(200, { statuses: [status], tasks: [task] }, seen) })
    expect(await client.board('casa')).toEqual({ statuses: [status], tasks: [task] })
    expect(seen.url).toBe('/api/tasks?boardId=casa')
  })

  it('reads null for a board that is gone (404)', async () => {
    const client = httpTasksClient({ config, fetch: answering(404, { error: 'board não encontrado' }) })
    expect(await client.board('gone')).toBeNull()
  })

  it('lists the boards, and refuses one in a shape it does not know', async () => {
    expect(await httpTasksClient({ config, fetch: answering(200, [board]) }).boards()).toEqual([board])
    await expect(httpTasksClient({ config, fetch: answering(200, [{ ...board, prefix: 3 }]) }).boards()).rejects.toThrow(
      ApiError,
    )
  })

  it('posts a board, and carries the 409 of a prefix in use as its message', async () => {
    const seen: { url?: string; init?: RequestInit } = {}
    const client = httpTasksClient({ config, fetch: answering(201, board, seen) })
    expect(await client.createBoard({ name: 'Casa', prefix: 'CASA' })).toEqual(board)
    expect([seen.url, seen.init?.method]).toEqual(['/api/boards', 'POST'])
    expect(JSON.parse(seen.init?.body as string)).toEqual({ name: 'Casa', prefix: 'CASA' })

    const taken = httpTasksClient({ config, fetch: answering(409, { error: 'o prefixo T já foi usado por um board' }) })
    await expect(taken.createBoard({ name: 'Casa', prefix: 'T' })).rejects.toThrow('o prefixo T já foi usado por um board')
  })

  it('patches a board with only the fields given, and answers null when it is gone', async () => {
    const seen: { url?: string; init?: RequestInit } = {}
    const client = httpTasksClient({ config, fetch: answering(200, { ...board, prefix: 'LAR' }, seen) })
    expect(await client.updateBoard('casa', { prefix: 'LAR' })).toEqual({ ...board, prefix: 'LAR' })
    expect([seen.url, seen.init?.method]).toEqual(['/api/boards/casa', 'PATCH'])
    expect(JSON.parse(seen.init?.body as string)).toEqual({ prefix: 'LAR' })
    expect(await httpTasksClient({ config, fetch: answering(404, { error: 'board não encontrado' }) }).updateBoard('x', { name: 'y' })).toBeNull()
  })

  it('posts board, title and status, and gives back the created task', async () => {
    const seen: { url?: string; init?: RequestInit } = {}
    const client = httpTasksClient({ config, fetch: answering(201, task, seen) })

    expect(await client.create({ boardId: 'casa', title: 'Comprar café', statusId: 'todo' })).toEqual(task)
    expect(seen.url).toBe('/api/tasks')
    expect(seen.init?.method).toBe('POST')
    expect(JSON.parse(seen.init?.body as string)).toEqual({ boardId: 'casa', title: 'Comprar café', statusId: 'todo' })
  })

  it('refuses a board in a shape it does not know, at the boundary', async () => {
    const client = httpTasksClient({ config, fetch: answering(200, { statuses: [status], tasks: [{ ...task, key: '1' }] }) })
    await expect(client.board('casa')).rejects.toThrow(ApiError)
  })

  it('carries the refusal of the server as its message', async () => {
    const client = httpTasksClient({
      config,
      fetch: answering(400, { errors: [{ field: 'title', message: 'o título é obrigatório' }] }),
    })
    await expect(client.create({ boardId: 'casa', title: ' ', statusId: 'todo' })).rejects.toThrow('o título é obrigatório')
  })

  it('says nobody answered when the API is down (C6)', async () => {
    const client = httpTasksClient({
      config,
      fetch: (async () => {
        throw new TypeError('fetch failed')
      }) as unknown as typeof fetch,
    })
    await expect(client.create({ boardId: 'casa', title: 'x', statusId: 'todo' })).rejects.toThrow(ApiUnreachableError)
  })

  it('patches only the fields given, placement as statusId and rank', async () => {
    const seen: { url?: string; init?: RequestInit } = {}
    const client = httpTasksClient({ config, fetch: answering(200, task, seen) })

    await client.update({ prefix: 'CASA', key: 1 }, { priority: 2, placement: { statusId: 'doing', rank: 'm' } })

    expect(seen.url).toBe('/api/tasks/CASA-1')
    expect(seen.init?.method).toBe('PATCH')
    expect(JSON.parse(seen.init?.body as string)).toEqual({ priority: 2, statusId: 'doing', rank: 'm' })
  })

  it('answers null to a patch and false to a delete when the task is gone (404)', async () => {
    const gone = httpTasksClient({ config, fetch: answering(404, { error: 'tarefa não encontrada' }) })
    expect(await gone.update({ prefix: 'T', key: 9 }, { title: 'x' })).toBeNull()
    expect(await gone.delete({ prefix: 'T', key: 9 })).toBe(false)
  })

  it('deletes by key', async () => {
    const seen: { url?: string; init?: RequestInit } = {}
    const client = httpTasksClient({
      config,
      fetch: (async (url: string, init?: RequestInit) => {
        seen.url = url
        seen.init = init
        return new Response(null, { status: 204 })
      }) as unknown as typeof fetch,
    })
    expect(await client.delete({ prefix: 'CASA', key: 2 })).toBe(true)
    expect([seen.url, seen.init?.method]).toEqual(['/api/tasks/CASA-2', 'DELETE'])
  })
})
