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
  labelIds: [],
}
const status = { id: 'todo', boardId: 'casa', name: 'A fazer', category: 'unstarted', color: 'gray', position: 1 }
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

  it('#45: reads, posts and deletes the comments under the whole key, and 404 is gone', async () => {
    const comment = { id: 'c1', body: 'ele vem quinta', createdAt: '2026-11-05T17:32:00.000Z' }
    const seen: { url?: string; init?: RequestInit } = {}
    expect(await httpTasksClient({ config, fetch: answering(200, [comment], seen) }).comments({ prefix: 'CASA', key: 3 })).toEqual([comment])
    expect(seen.url).toBe('/api/tasks/CASA-3/comments')

    const posted: { url?: string; init?: RequestInit } = {}
    expect(await httpTasksClient({ config, fetch: answering(201, comment, posted) }).addComment({ prefix: 'T', key: 1 }, 'ele vem quinta')).toEqual(comment)
    expect([posted.url, posted.init?.method, JSON.parse(posted.init?.body as string)]).toEqual([
      '/api/tasks/T-1/comments',
      'POST',
      { body: 'ele vem quinta' },
    ])

    const gone = httpTasksClient({ config, fetch: answering(404, { error: 'tarefa não encontrada' }) })
    expect(await gone.comments({ prefix: 'T', key: 9 })).toBeNull()
    expect(await gone.addComment({ prefix: 'T', key: 9 }, 'x')).toBeNull()
    expect(await gone.deleteComment({ prefix: 'T', key: 9 }, 'c1')).toBe(false)
    await expect(httpTasksClient({ config, fetch: answering(200, [{ ...comment, body: 3 }]) }).comments({ prefix: 'T', key: 1 })).rejects.toThrow(ApiError)
    await expect(
      httpTasksClient({ config, fetch: answering(400, { errors: [{ field: 'body', message: 'o comentário é obrigatório' }] }) }).addComment({ prefix: 'T', key: 1 }, ' '),
    ).rejects.toThrow('o comentário é obrigatório')
  })

  it('#43: posts, patches and deletes a status, with moveTo in the query, and refuses a color it does not know', async () => {
    const review = { ...status, id: 'review', name: 'Revisão', category: 'started', color: 'purple', position: 3 }
    const posted: { url?: string; init?: RequestInit } = {}
    expect(await httpTasksClient({ config, fetch: answering(201, review, posted) }).addStatus('casa', { name: 'Revisão', category: 'started', color: 'purple' })).toEqual(review)
    expect([posted.url, posted.init?.method, JSON.parse(posted.init?.body as string)]).toEqual([
      '/api/boards/casa/statuses',
      'POST',
      { name: 'Revisão', category: 'started', color: 'purple' },
    ])

    const patched: { url?: string; init?: RequestInit } = {}
    await httpTasksClient({ config, fetch: answering(200, review, patched) }).updateStatus('review', { color: 'green' })
    expect([patched.url, JSON.parse(patched.init?.body as string)]).toEqual(['/api/statuses/review', { color: 'green' }])

    const deleted: { url?: string; init?: RequestInit } = {}
    const client = httpTasksClient({
      config,
      fetch: (async (url: string, init?: RequestInit) => {
        deleted.url = url
        deleted.init = init
        return new Response(null, { status: 204 })
      }) as unknown as typeof fetch,
    })
    expect(await client.deleteStatus('review', 'done')).toBe(true)
    expect([deleted.url, deleted.init?.method]).toEqual(['/api/statuses/review?moveTo=done', 'DELETE'])

    const conflict = httpTasksClient({ config, fetch: answering(409, { error: 'o board precisa de ao menos um status' }) })
    await expect(conflict.deleteStatus('todo')).rejects.toThrow('o board precisa de ao menos um status')
    expect(await httpTasksClient({ config, fetch: answering(404, { error: 'status não encontrado' }) }).deleteStatus('x')).toBe(false)
    await expect(
      httpTasksClient({ config, fetch: answering(200, { statuses: [{ ...status, color: 'magenta' }], tasks: [] }) }).board('casa'),
    ).rejects.toThrow(ApiError)
  })

  it('#47: searches with the text in the query, and asks nothing for an empty one', async () => {
    const result = { key: 3, keyPrefix: 'CASA', title: 'Trocar a lâmpada', boardId: 'casa', boardName: 'Casa' }
    const seen: { url?: string; init?: RequestInit } = {}
    expect(await httpTasksClient({ config, fetch: answering(200, { results: [result] }, seen) }).search('casa 3')).toEqual([result])
    expect(seen.url).toBe('/api/tasks/search?q=casa%203')

    let called = false
    const idle = httpTasksClient({
      config,
      fetch: (async () => {
        called = true
        return new Response('{}')
      }) as unknown as typeof fetch,
    })
    expect(await idle.search('  ')).toEqual([])
    expect(called).toBe(false)
    await expect(httpTasksClient({ config, fetch: answering(200, { results: [{ ...result, key: '3' }] }) }).search('x')).rejects.toThrow(ApiError)
  })

  it('#46: patches labelIds as the whole set, and refuses a task without its labels', async () => {
    const seen: { url?: string; init?: RequestInit } = {}
    await httpTasksClient({ config, fetch: answering(200, { ...task, labelIds: ['l1'] }, seen) }).update({ prefix: 'CASA', key: 1 }, { labelIds: ['l1'] })
    expect(JSON.parse(seen.init?.body as string)).toEqual({ labelIds: ['l1'] })
    const { labelIds: _gone, ...without } = task
    await expect(httpTasksClient({ config, fetch: answering(200, { statuses: [], tasks: [without] }) }).board('casa')).rejects.toThrow(ApiError)
  })
})
