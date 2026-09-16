import { entryRepositoryContract } from '@dailly/domain/testing'
import { createEntry, sequentialIds, fixedClock, uuidIds } from '@dailly/domain'
import { createServer, type RunningServer } from '../server/src/index.js'
import { httpEntryRepository } from '../ui/src/adapters/http-entry-repository.js'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * The two halves of the port, against each other, for real.
 *
 * Everything else proves one side: the server's suite proves it implements the
 * protocol, the renderer's suite proves the client speaks it. Neither would
 * notice if the two drifted apart — a renamed field, a changed status code, a
 * query parameter spelled differently would leave both suites green and the
 * app broken.
 *
 * This file lives at the repo root, outside every project, on purpose. The
 * workspace architecture rule forbids `ui/` and `server/` from importing each
 * other (ADR 0007), and that rule is right: neither should know the other at
 * build time. An end-to-end test is the one place that must know both, so it
 * sits where no such rule applies.
 */

const running: RunningServer[] = []

afterAll(async () => {
  await Promise.all(running.map((server) => server.close()))
})

/** A real server, a real socket, a real client — fresh per test. */
async function makeOverTheWire(token?: string) {
  const server = await createServer({
    databaseFile: ':memory:',
    ...(token ? { token } : {}),
  })
  running.push(server)
  return httpEntryRepository({
    config: { baseUrl: server.url, ...(token ? { token } : {}) },
  })
}

// The same contract the in-memory fake and the SQLite store pass, now across a
// socket. Three implementations, one set of promises.
entryRepositoryContract('httpEntryRepository against the real server', {
  make: () => makeOverTheWire(),
})

describe('the vertical slice, end to end', () => {
  it('creates an entry through the use-case and reads it back over HTTP', async () => {
    // Exactly what the app does: the use-case runs on the renderer side, the
    // store answers from the other end of the wire.
    const entries = await makeOverTheWire()
    const create = createEntry({
      entries,
      clock: fixedClock('2026-09-16T12:00:00.000Z'),
      ids: uuidIds,
    })

    const created = await create({ body: '* um\n+ dois\n5. três' })

    // Normalized once, on the way in, and stored exactly as normalized.
    expect(created.body).toBe('- um\n- dois\n1. três')
    expect(await entries.list({})).toEqual([created])
  })

  it('refuses an id the domain did not mint', async () => {
    // The server validates because it is reachable from outside the domain.
    // `sequentialIds` is a test helper, and the API is right to reject it.
    const entries = await makeOverTheWire()
    const create = createEntry({
      entries,
      clock: fixedClock('2026-09-16T12:00:00.000Z'),
      ids: sequentialIds(),
    })

    await expect(create({ body: 'com id de teste' })).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'id deve ser um UUID',
    })
  })

  it('carries the per-run token all the way through', async () => {
    const guarded = await makeOverTheWire('token-desta-execucao')
    expect(await guarded.list({})).toEqual([])

    // And the same server refuses a client that does not have it.
    const server = running[running.length - 1]!
    const anonymous = httpEntryRepository({ config: { baseUrl: server.url } })
    await expect(anonymous.list({})).rejects.toMatchObject({ name: 'ApiError', status: 401 })
  })
})
