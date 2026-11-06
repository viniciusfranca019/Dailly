import { UTC } from '@dailly/periods'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './shell/app.js'
import { openDatabase } from './shell/database.js'

/**
 * Comments over HTTP (card #45, F7), with the real manifest and a real
 * SQLite. At the root of `src/` because it builds the whole app.
 */
let app: ReturnType<typeof buildApp>

beforeEach(async () => {
  app = buildApp({ db: openDatabase(':memory:'), zone: UTC })
  await app.inject({ method: 'POST', url: '/tasks', payload: { boardId: 'tasks', title: 'Chamar o encanador', statusId: 'todo' } })
})

const post = (key: string, payload: unknown) =>
  app.inject({ method: 'POST', url: `/tasks/${key}/comments`, payload: payload as object })
const list = (key: string) => app.inject({ method: 'GET', url: `/tasks/${key}/comments` })

describe('POST /tasks/:key/comments', () => {
  it('C1: answers 201 with the comment, and GET lists it after the older one', async () => {
    await post('T-1', { body: 'liguei pro encanador' })
    const response = await post('T-1', { body: 'ele vem quinta' })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({ id: expect.any(String), body: 'ele vem quinta', createdAt: expect.any(String) })
    expect((await list('T-1')).json().map((comment: { body: string }) => comment.body)).toEqual([
      'liguei pro encanador',
      'ele vem quinta',
    ])
  })

  it('C3: refuses a body of spaces with 400 "o comentário é obrigatório", and the list stays empty', async () => {
    const response = await post('T-1', { body: '   ' })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ errors: [{ field: 'body', message: 'o comentário é obrigatório' }] })
    expect((await list('T-1')).json()).toEqual([])
  })

  it('refuses a body that is not text, or a field besides body, with 400', async () => {
    expect((await post('T-1', { body: 3 })).statusCode).toBe(400)
    expect((await post('T-1', {})).statusCode).toBe(400)
    const extra = await post('T-1', { body: 'x', author: 'eu' })
    expect(extra.statusCode).toBe(400)
    expect(extra.json().errors[0].field).toBe('author')
    expect((await list('T-1')).json()).toEqual([])
  })

  it('answers 404 "tarefa não encontrada" for a key with no task', async () => {
    for (const response of [await post('T-9', { body: 'x' }), await list('T-9'), await post('xyz', { body: 'x' })]) {
      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ error: 'tarefa não encontrada' })
    }
  })
})

describe('DELETE /tasks/:key/comments/:id', () => {
  it('C5: deletes the comment, and GET no longer brings it back', async () => {
    const { id } = (await post('T-1', { body: 'ele vem quinta' })).json()

    const response = await app.inject({ method: 'DELETE', url: `/tasks/T-1/comments/${id}` })

    expect(response.statusCode).toBe(204)
    expect((await list('T-1')).json()).toEqual([])
  })

  it('answers 404 for a comment that does not exist, or that is another task’s', async () => {
    await app.inject({ method: 'POST', url: '/tasks', payload: { boardId: 'tasks', title: 'dois', statusId: 'todo' } })
    const { id } = (await post('T-2', { body: 'da dois' })).json()

    const other = await app.inject({ method: 'DELETE', url: `/tasks/T-1/comments/${id}` })
    expect(other.statusCode).toBe(404)
    expect(other.json()).toEqual({ error: 'comentário não encontrado' })
    expect((await app.inject({ method: 'DELETE', url: `/tasks/T-9/comments/${id}` })).json()).toEqual({
      error: 'tarefa não encontrada',
    })
    expect((await list('T-2')).json()).toHaveLength(1)
  })

  it('takes the comments with the task deleted', async () => {
    await post('T-1', { body: 'x' })
    await app.inject({ method: 'DELETE', url: '/tasks/T-1' })
    await app.inject({ method: 'POST', url: '/tasks', payload: { boardId: 'tasks', title: 'nova', statusId: 'todo' } })

    expect((await list('T-2')).json()).toEqual([])
  })
})

describe('C7: a comment never shows in the Daily Log (RN14)', () => {
  it('GET /entries does not return "ele vem quinta"', async () => {
    await post('T-1', { body: 'ele vem quinta' })

    const listed = (await app.inject({ method: 'GET', url: '/entries' })).json()
    expect(listed.map((entry: { body: string }) => entry.body)).not.toContain('ele vem quinta')
    expect(listed).toEqual([])
  })
})
