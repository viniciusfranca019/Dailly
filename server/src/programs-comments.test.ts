import { UTC } from '@dailly/periods'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './shell/app.js'
import { openDatabase } from './shell/database.js'

/**
 * A program's comments over HTTP (programa-comentarios), with the real
 * manifest and a real SQLite: the mirror of `tasks-comments.test.ts`.
 */
let app: ReturnType<typeof buildApp>
let dailly: string

beforeEach(async () => {
  app = buildApp({ db: openDatabase(':memory:'), zone: UTC })
  dailly = (await app.inject({ method: 'POST', url: '/programs', payload: { name: 'Dailly v1' } })).json().id
})

const post = (id: string, payload: unknown) =>
  app.inject({ method: 'POST', url: `/programs/${id}/comments`, payload: payload as object })
const list = (id: string) => app.inject({ method: 'GET', url: `/programs/${id}/comments` })
const remove = (id: string, comment: string) => app.inject({ method: 'DELETE', url: `/programs/${id}/comments/${comment}` })

describe('C1: Comentar um programa', () => {
  it('answers 201 with "ele vem quinta", and GET lists it after "liguei pro encanador"', async () => {
    await post(dailly, { body: 'liguei pro encanador' })
    const response = await post(dailly, { body: '  ele vem quinta \n' })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({ id: expect.any(String), body: 'ele vem quinta', createdAt: expect.any(String) })
    expect((await list(dailly)).json().map((comment: { body: string }) => comment.body)).toEqual([
      'liguei pro encanador',
      'ele vem quinta',
    ])
  })
})

describe('C2: Comentário vazio é recusado', () => {
  it('refuses a body of spaces with 400 "o comentário é obrigatório", and the list stays empty', async () => {
    const response = await post(dailly, { body: ' \n \n' })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ errors: [{ field: 'body', message: 'o comentário é obrigatório' }] })
    expect((await list(dailly)).json()).toEqual([])
  })

  it('refuses a body that is not text, or a field besides body, naming the field', async () => {
    expect((await post(dailly, { body: 3 })).statusCode).toBe(400)
    expect((await post(dailly, {})).statusCode).toBe(400)
    const extra = await post(dailly, { body: 'x', author: 'eu' })
    expect(extra.statusCode).toBe(400)
    expect(extra.json().errors[0].field).toBe('author')
    expect((await list(dailly)).json()).toEqual([])
  })
})

describe('C3: Programa que não existe', () => {
  it('answers 404 "programa não encontrado" to read, comment and delete, and writes nothing', async () => {
    const { id } = (await post(dailly, { body: 'fica' })).json()

    for (const response of [await list('nope'), await post('nope', { body: 'x' }), await post('nope', { body: '   ' }), await remove('nope', id)]) {
      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ error: 'programa não encontrado' })
    }
    expect((await list(dailly)).json()).toHaveLength(1)
  })
})

describe('C4: Apagar um comentário do programa', () => {
  it('deletes "ele vem quinta" and keeps "liguei pro encanador"', async () => {
    await post(dailly, { body: 'liguei pro encanador' })
    const { id } = (await post(dailly, { body: 'ele vem quinta' })).json()

    const response = await remove(dailly, id)

    expect(response.statusCode).toBe(204)
    expect((await list(dailly)).json().map((comment: { body: string }) => comment.body)).toEqual(['liguei pro encanador'])
  })

  it('answers 404 "comentário não encontrado" for another program’s comment or a task’s, and deletes nothing', async () => {
    const outro = (await app.inject({ method: 'POST', url: '/programs', payload: { name: 'Outro' } })).json().id
    const ofOther = (await post(outro, { body: 'do outro' })).json().id
    await app.inject({ method: 'POST', url: '/tasks', payload: { boardId: 'tasks', title: 'um', statusId: 'todo' } })
    const ofTask = (await app.inject({ method: 'POST', url: '/tasks/T-1/comments', payload: { body: 'da tarefa' } })).json().id

    for (const id of [ofOther, ofTask, 'nope']) {
      const response = await remove(dailly, id)
      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ error: 'comentário não encontrado' })
    }
    expect((await list(outro)).json()).toHaveLength(1)
    expect((await app.inject({ method: 'GET', url: '/tasks/T-1/comments' })).json()).toHaveLength(1)
  })
})

describe('C5: Comentário do programa fica no programa', () => {
  it('"ele vem quinta" is in neither the comments of LAB-5 nor the Daily Log', async () => {
    const labs = (await app.inject({ method: 'POST', url: '/boards', payload: { name: 'Labs', prefix: 'LAB' } })).json()
    const todo = (await app.inject({ method: 'GET', url: `/tasks?boardId=${labs.id}` })).json().statuses[1].id
    for (let n = 0; n < 5; n += 1) {
      await app.inject({ method: 'POST', url: '/tasks', payload: { boardId: labs.id, title: `lab ${n + 1}`, statusId: todo } })
    }
    await app.inject({ method: 'POST', url: `/programs/${dailly}/tasks`, payload: { key: 'LAB-5' } })

    await post(dailly, { body: 'ele vem quinta' })

    expect((await app.inject({ method: 'GET', url: '/tasks/LAB-5/comments' })).json()).toEqual([])
    const entries = (await app.inject({ method: 'GET', url: '/entries' })).json()
    expect(entries.map((entry: { body: string }) => entry.body)).not.toContain('ele vem quinta')
  })
})
