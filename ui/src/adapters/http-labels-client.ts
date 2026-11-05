import { isLabelColor, type Label } from '@dailly/domain'
import type { LabelsPort } from '@shared'
import type { ApiConfig } from './api.js'
import { ApiError } from './errors.js'
import { httpClient } from './http.js'

export interface HttpLabelsClientDeps {
  readonly config: ApiConfig
  readonly fetch?: typeof globalThis.fetch
}

const parseLabel = (value: unknown): Label => {
  const label = value as Partial<Record<keyof Label, unknown>> | null
  if (
    typeof label !== 'object' ||
    label === null ||
    typeof label.id !== 'string' ||
    typeof label.name !== 'string' ||
    !isLabelColor(label.color)
  ) {
    throw new ApiError(200, 'a API respondeu uma label num formato que não reconheço')
  }
  return { id: label.id, name: label.name, color: label.color }
}

const gone = (error: unknown): boolean => error instanceof ApiError && error.status === 404

/** `LabelsPort` over HTTP: `/labels` (card #34), parsed at the boundary. */
export function httpLabelsClient({ config, fetch }: HttpLabelsClientDeps): LabelsPort {
  const send = httpClient({ config, ...(fetch ? { fetch } : {}) })
  const one = (id: string) => `/labels/${encodeURIComponent(id)}`

  return {
    async list() {
      const answer = await send('/labels')
      if (!Array.isArray(answer)) throw new ApiError(200, 'a API respondeu as labels num formato que não reconheço')
      return answer.map(parseLabel)
    },
    async create(input) {
      return parseLabel(await send('/labels', { method: 'POST', body: JSON.stringify(input) }))
    },
    async update(id, change) {
      try {
        return parseLabel(await send(one(id), { method: 'PATCH', body: JSON.stringify(change) }))
      } catch (error) {
        if (gone(error)) return null
        throw error
      }
    },
    async delete(id) {
      try {
        await send(one(id), { method: 'DELETE' })
        return true
      } catch (error) {
        if (gone(error)) return false
        throw error
      }
    },
  }
}
