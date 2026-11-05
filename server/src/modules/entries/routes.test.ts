import { NotImplementedError, inMemoryEntryRepository } from '@dailly/domain'
import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { registerEntryRoutes } from './routes.js'

/**
 * C3 of card #29: the routes over a repository that refuses, with no shell in
 * between. It was in `app.test.ts`, injected through `buildApp`; the
 * repository is the module's own now, so the test mounts the routes on it.
 */
describe('the entries routes', () => {
  it('answers 501, not 500, when the store refuses something that is Fase 2', async () => {
    // The distinction matters: 500 sends the reader hunting for a bug that
    // does not exist. Driven through a store that refuses, because the route
    // does not forward label filters yet — without this the mapping would be
    // code no test ever reaches.
    const refusing = Fastify()
    registerEntryRoutes(refusing, {
      ...inMemoryEntryRepository(),
      list: async () => {
        throw new NotImplementedError('filtrar por label')
      },
    })

    const response = await refusing.inject({ method: 'GET', url: '/entries' })

    expect(response.statusCode).toBe(501)
    expect(response.json().error).toContain('Fase 2')
  })
})
