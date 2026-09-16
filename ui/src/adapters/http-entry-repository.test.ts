import { NotImplementedError, type Entry } from '@dailly/domain'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, ApiUnreachableError } from './errors.js'
import { httpEntryRepository } from './http-entry-repository.js'

const AT = '2026-07-24T10:00:00.000Z'
const entry: Entry = {
  id: '11111111-2222-4333-8444-555555555555',
  body: '# título',
  occurredAt: AT,
  createdAt: AT,
  updatedAt: AT,
  labelIds: [],
  props: {},
}

// The parameters are declared even though the fake ignores them: without them
// `mock.calls` is typed as an empty tuple and every assertion below stops
// compiling.
const respondWith = (body: unknown, status = 200) =>
  vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status }),
  )

const subject = (fetch: typeof globalThis.fetch, token?: string) =>
  httpEntryRepository({ config: { baseUrl: '/api', ...(token ? { token } : {}) }, fetch })

describe('httpEntryRepository', () => {
  it('posts an entry and returns what the API stored', async () => {
    const fetch = respondWith(entry, 201)

    expect(await subject(fetch).create(entry)).toEqual(entry)

    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('/api/entries')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual(entry)
  })

  it('lists with no query when there is no filter', async () => {
    const fetch = respondWith([entry])

    expect(await subject(fetch).list({})).toEqual([entry])
    expect(fetch.mock.calls[0]![0]).toBe('/api/entries')
  })

  it('puts the date filter on the query string', async () => {
    const fetch = respondWith([])

    await subject(fetch).list({ from: '2026-07-01', to: '2026-07-31' })

    expect(fetch.mock.calls[0]![0]).toBe('/api/entries?from=2026-07-01&to=2026-07-31')
  })

  it('carries the token when the shell gave it one', async () => {
    // ADR 0008's per-run token. Without this header every request is a 401.
    const fetch = respondWith([])

    await subject(fetch, 'segredo').list({})

    const headers = fetch.mock.calls[0]![1]?.headers as Record<string, string>
    expect(headers['authorization']).toBe('Bearer segredo')
  })

  it('sends no authorization header when there is no token', async () => {
    const fetch = respondWith([])

    await subject(fetch).list({})

    expect((fetch.mock.calls[0]![1]?.headers as Record<string, string>)['authorization']).toBeUndefined()
  })

  describe('turning HTTP back into something the UI can act on', () => {
    it('reports a refusal with its status and the API message', async () => {
      const fetch = respondWith({ errors: [{ field: 'body', message: 'é obrigatório' }] }, 400)

      await expect(subject(fetch).create(entry)).rejects.toMatchObject({
        name: 'ApiError',
        status: 400,
        message: 'body é obrigatório',
      })
    })

    it('distinguishes "nobody answered" from "the answer was no"', async () => {
      // ADR 0007 named this as the cost of putting HTTP in the middle. The two
      // are different things to show a person: one is a bad request, the other
      // is the local API not being up.
      const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
        throw new TypeError('Failed to fetch')
      })

      const error = await subject(fetch)
        .list({})
        .catch((error: unknown) => error)

      expect(error).toBeInstanceOf(ApiUnreachableError)
      expect(error).not.toBeInstanceOf(ApiError)
    })

    it('translates 501 back into the domain word for it', async () => {
      // One vocabulary across the wire: a caller should not have to learn HTTP
      // to find out that something is Fase 2.
      const fetch = respondWith({ error: 'filtrar por label chega na Fase 2 do roadmap' }, 501)

      await expect(subject(fetch).list({})).rejects.toBeInstanceOf(NotImplementedError)
    })

    it('refuses a label filter before spending a request on it', async () => {
      const fetch = respondWith([])

      await expect(subject(fetch).list({ labelIds: ['ideia'] })).rejects.toBeInstanceOf(
        NotImplementedError,
      )
      expect(fetch).not.toHaveBeenCalled()
    })
  })
})
