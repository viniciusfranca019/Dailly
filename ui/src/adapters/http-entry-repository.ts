import type { Entry, EntryFilter, EntryRepository } from '@dailly/domain'
import { NotImplementedError } from '@dailly/domain'
import type { ApiConfig } from './api.js'
import { ApiError, ApiUnreachableError } from './errors.js'

/**
 * `EntryRepository` over HTTP — the renderer's side of the port.
 *
 * This is why the use-cases can live in the renderer at all (see
 * `@dailly/domain`'s `index.ts`): `createEntry` composes over *a repository*,
 * and this one happens to reach the store through a socket instead of a
 * function call. Nothing above it knows the difference, which is the whole
 * claim ports & adapters makes and the reason this file is small.
 */

export interface HttpEntryRepositoryDeps {
  readonly config: ApiConfig
  /** Injected so a test can drive the wire without a server. */
  readonly fetch?: typeof globalThis.fetch
}

export const httpEntryRepository = ({
  config,
  fetch: doFetch = globalThis.fetch.bind(globalThis),
}: HttpEntryRepositoryDeps): EntryRepository => {
  const request = async (path: string, init: RequestInit = {}): Promise<unknown> => {
    let response: Response
    try {
      response = await doFetch(`${config.baseUrl}${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
          ...init.headers,
        },
      })
    } catch (cause) {
      // A rejected fetch is the network, not the server: no status to report.
      throw new ApiUnreachableError(cause)
    }

    const payload: unknown = response.status === 204 ? undefined : await response.json()

    if (!response.ok) {
      // 501 is the server saying "this is Fase 2", and the domain already has a
      // name for that. Translating it back keeps one vocabulary across the wire
      // instead of making every caller learn HTTP.
      if (response.status === 501) throw new NotImplementedError(describe(payload))
      throw new ApiError(response.status, describe(payload), payload)
    }

    return payload
  }

  return {
    async create(entry) {
      return (await request('/entries', {
        method: 'POST',
        body: JSON.stringify(entry),
      })) as Entry
    },

    async list(filter: EntryFilter) {
      const query = new URLSearchParams()
      if (filter.from) query.set('from', filter.from)
      if (filter.to) query.set('to', filter.to)
      if (filter.labelIds?.length || (filter.props && Object.keys(filter.props).length > 0)) {
        // Refuse here rather than send a filter the API would ignore: silently
        // returning everything looks like working software.
        throw new NotImplementedError('filtrar por label ou propriedade')
      }

      const suffix = query.size > 0 ? `?${query}` : ''
      return (await request(`/entries${suffix}`)) as Entry[]
    },

    async update() {
      throw new NotImplementedError('update')
    },
    async delete() {
      throw new NotImplementedError('delete')
    },
    async getById() {
      throw new NotImplementedError('getById')
    },
  }
}

/** Pull a human message out of whatever the API sent back. */
function describe(payload: unknown): string {
  if (typeof payload === 'object' && payload !== null) {
    const body = payload as { error?: unknown; errors?: { field?: string; message?: string }[] }
    if (typeof body.error === 'string') return body.error
    if (Array.isArray(body.errors)) {
      return body.errors
        .map((error) => [error.field, error.message].filter(Boolean).join(' '))
        .join('; ')
    }
  }
  return 'a API recusou a requisição'
}
