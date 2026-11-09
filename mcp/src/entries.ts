import { EntryNotFoundError, formatPropertyValue, type Entry, type EntryRepository, type PropertyValue } from '@dailly/domain'
import { ApiRefusal, type Api } from './api.js'

/**
 * The Daily Log's port over the MCP's own client (card #58): the other side of
 * the same routes the screen's `httpEntryRepository` calls, so `createEntry`
 * and `updateEntry` run here exactly as they run in the browser.
 */
export function httpEntries(api: Api): EntryRepository {
  const one = async (id: string, init?: Parameters<Api>[1]) => {
    try {
      return await api(`/entries/${encodeURIComponent(id)}`, init)
    } catch (error) {
      if (error instanceof ApiRefusal && error.status === 404) throw new EntryNotFoundError()
      throw error
    }
  }

  return {
    async create(entry) {
      return (await api('/entries', { method: 'POST', body: entry })) as Entry
    },
    async list(filter) {
      const query = new URLSearchParams()
      if (filter.from) query.set('from', filter.from)
      if (filter.to) query.set('to', filter.to)
      if (filter.labelIds?.length) query.set('labelIds', filter.labelIds.join(','))
      for (const [key, value] of Object.entries(filter.props ?? {})) {
        query.set(`props[${key}]`, formatPropertyValue(value as PropertyValue))
      }
      return (await api(`/entries${query.size > 0 ? `?${query}` : ''}`)) as Entry[]
    },
    async update(id, patch) {
      return (await one(id, { method: 'PATCH', body: patch })) as Entry
    },
    async delete(id) {
      await one(id, { method: 'DELETE' })
    },
    async getById(id) {
      try {
        return (await one(id)) as Entry
      } catch (error) {
        if (error instanceof EntryNotFoundError) return null
        throw error
      }
    },
  }
}
