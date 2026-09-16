import { NotImplementedError, inMemoryEntryRepository, uuidIds } from '@dailly/domain'
import { UTC } from '@dailly/periods'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'

const anEntry = (over: Partial<Record<string, unknown>> = {}) => {
  const at = '2026-07-24T10:00:00.000Z'
  return {
    id: uuidIds.next(),
    body: 'Descobri um padrão melhor para o adapter',
    occurredAt: at,
    createdAt: at,
    updatedAt: at,
    labelIds: [],
    props: {},
    ...over,
  }
}

describe('the HTTP surface', () => {
  let app: ReturnType<typeof buildApp>

  beforeEach(() => {
    app = buildApp({ entries: inMemoryEntryRepository(), zone: UTC })
  })

  it('accepts an entry and gives it back created', async () => {
    const entry = anEntry()

    const response = await app.inject({ method: 'POST', url: '/entries', payload: entry })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual(entry)
  })

  it('lists what was posted', async () => {
    const entry = anEntry()
    await app.inject({ method: 'POST', url: '/entries', payload: entry })

    const response = await app.inject({ method: 'GET', url: '/entries' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([entry])
  })

  it('reports the zone, because the UI must always show it', async () => {
    // ADR 0007: "a UI sempre mostra qual zona está em uso". Only this process
    // knows — the zone is its environment variable.
    const saoPaulo = buildApp({
      entries: inMemoryEntryRepository(),
      zone: 'America/Sao_Paulo',
    })

    expect((await saoPaulo.inject({ method: 'GET', url: '/health' })).json()).toEqual({
      status: 'ok',
      zone: 'America/Sao_Paulo',
    })
  })

  describe('refusing what should not enter the store', () => {
    it('rejects an empty body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/entries',
        payload: anEntry({ body: '   ' }),
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().errors).toContainEqual({ field: 'body', message: 'é obrigatório' })
    })

    it('rejects an id that is not a UUID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/entries',
        payload: anEntry({ id: 'entry-1' }),
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().errors).toContainEqual({ field: 'id', message: 'deve ser um UUID' })
    })

    it('rejects a timestamp that is not a UTC instant', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/entries',
        payload: anEntry({ occurredAt: '2026-07-24' }),
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().errors[0].field).toBe('occurredAt')
    })

    it('reports every problem at once, not the first', async () => {
      // Four round trips to learn four things is a worse API than one.
      const response = await app.inject({
        method: 'POST',
        url: '/entries',
        payload: { id: 'nope', body: '', occurredAt: 'ontem' },
      })

      expect(response.json().errors.map((error: { field: string }) => error.field).sort()).toEqual(
        ['body', 'createdAt', 'id', 'occurredAt', 'updatedAt'].sort(),
      )
    })

    it('rejects a malformed date in the filter', async () => {
      const response = await app.inject({ method: 'GET', url: '/entries?from=24/07/2026' })

      expect(response.statusCode).toBe(400)
      expect(response.json().errors[0].field).toBe('from')
    })

    it('accepts a well-formed date filter', async () => {
      const response = await app.inject({ method: 'GET', url: '/entries?from=2026-07-01' })
      expect(response.statusCode).toBe(200)
    })

    it('answers 501, not 500, when the store refuses something that is Fase 2', async () => {
      // The distinction matters: 500 sends the reader hunting for a bug that
      // does not exist. Driven through a store that refuses, because the route
      // does not forward label filters yet — without this the mapping would be
      // code no test ever reaches.
      const refusing = buildApp({
        entries: {
          ...inMemoryEntryRepository(),
          list: async () => {
            throw new NotImplementedError('filtrar por label')
          },
        },
        zone: UTC,
      })

      const response = await refusing.inject({ method: 'GET', url: '/entries' })

      expect(response.statusCode).toBe(501)
      expect(response.json().error).toContain('Fase 2')
    })
  })

  describe('the token, which ADR 0008 put in Fase 1', () => {
    const TOKEN = 'um-token-de-execucao'
    let guarded: ReturnType<typeof buildApp>

    beforeEach(() => {
      guarded = buildApp({ entries: inMemoryEntryRepository(), zone: UTC, token: TOKEN })
    })

    it('refuses a request with no token', async () => {
      // The API listens on 127.0.0.1, which every process on this machine can
      // reach. Without this, any program running as the user reads the diary.
      const response = await guarded.inject({ method: 'GET', url: '/entries' })
      expect(response.statusCode).toBe(401)
    })

    it('refuses a request with the wrong token', async () => {
      const response = await guarded.inject({
        method: 'GET',
        url: '/entries',
        headers: { authorization: 'Bearer outro' },
      })
      expect(response.statusCode).toBe(401)
    })

    it('accepts a request with the right token', async () => {
      const response = await guarded.inject({
        method: 'GET',
        url: '/entries',
        headers: { authorization: `Bearer ${TOKEN}` },
      })
      expect(response.statusCode).toBe(200)
    })

    it('lets the health check through, because the shell polls it before it has anything else', async () => {
      const response = await guarded.inject({ method: 'GET', url: '/health' })
      expect(response.statusCode).toBe(200)
    })

    it('does not guard anything when no token is configured', async () => {
      expect((await app.inject({ method: 'GET', url: '/entries' })).statusCode).toBe(200)
    })
  })
})
