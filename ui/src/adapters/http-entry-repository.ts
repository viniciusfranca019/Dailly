import type { Entry, EntryFilter, EntryRepository } from '@dailly/domain'
import { NotImplementedError } from '@dailly/domain'
import type { ApiConfig } from './api.js'
import { ApiError } from './errors.js'
import { httpClient } from './http.js'

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
  fetch,
}: HttpEntryRepositoryDeps): EntryRepository => {
  const send = httpClient({ config, ...(fetch ? { fetch } : {}) })

  /**
   * O 501 é o servidor dizendo "isso é Fase 2", e o domínio já tem nome para
   * isso. Traduzir de volta mantém um vocabulário só do outro lado da fita,
   * em vez de obrigar cada chamador a aprender HTTP.
   *
   * A tradução ficou aqui quando o resto da chamada subiu para `http.ts`: ela
   * é a única parte que conhece o domínio das entries, e levá-la junto faria
   * o cliente compartilhado conhecer dois domínios.
   */
  const request = async (path: string, init: RequestInit = {}): Promise<unknown> => {
    try {
      return await send(path, init)
    } catch (error) {
      if (error instanceof ApiError && error.status === 501) {
        throw new NotImplementedError(error.message)
      }
      throw error
    }
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
