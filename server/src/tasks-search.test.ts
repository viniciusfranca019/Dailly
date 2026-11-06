import { UTC } from '@dailly/periods'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './shell/app.js'
import { openDatabase } from './shell/database.js'

/** The task search over HTTP (card #47, F9), with the real manifest and a real SQLite. */
let app: ReturnType<typeof buildApp>

beforeEach(() => {
  app = buildApp({ db: openDatabase(':memory:'), zone: UTC })
})

const search = (q: string) => app.inject({ method: 'GET', url: `/tasks/search?q=${encodeURIComponent(q)}` })

describe('GET /tasks/search', () => {
  it('C4, C5: answers {results} with the key, the title and the board, across boards', async () => {
    const casa = (await app.inject({ method: 'POST', url: '/boards', payload: { name: 'Casa', prefix: 'CASA' } })).json()
    const todo = (await app.inject({ method: 'GET', url: `/tasks?boardId=${casa.id}` }))
      .json()
      .statuses.find((status: { name: string }) => status.name === 'A fazer').id
    await app.inject({ method: 'POST', url: '/tasks', payload: { boardId: 'tasks', title: 'Comprar café', statusId: 'todo' } })
    await app.inject({ method: 'POST', url: '/tasks', payload: { boardId: casa.id, title: 'Café da manhã', statusId: todo } })

    const byTitle = await search('café')
    expect(byTitle.statusCode).toBe(200)
    expect(byTitle.json()).toEqual({
      results: [
        { key: 1, keyPrefix: 'CASA', title: 'Café da manhã', boardId: casa.id, boardName: 'Casa' },
        { key: 1, keyPrefix: 'T', title: 'Comprar café', boardId: 'tasks', boardName: 'Tasks' },
      ],
    })
    expect((await search('t-1')).json().results.map((result: { title: string }) => result.title)).toEqual(['Comprar café'])
  })

  it('C6: answers no result for a text nothing has, and for an empty one', async () => {
    await app.inject({ method: 'POST', url: '/tasks', payload: { boardId: 'tasks', title: 'Comprar café', statusId: 'todo' } })

    expect((await search('orçamento')).json()).toEqual({ results: [] })
    expect((await search('   ')).json()).toEqual({ results: [] })
    expect((await app.inject({ method: 'GET', url: '/tasks/search' })).json()).toEqual({ results: [] })
  })
})
