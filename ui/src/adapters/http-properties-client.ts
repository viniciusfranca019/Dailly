import { isPropertyType, type PropertyDef } from '@dailly/domain'
import type { PropertiesPort } from '@shared'
import type { ApiConfig } from './api.js'
import { ApiError } from './errors.js'
import { httpClient } from './http.js'

const parseDef = (value: unknown): PropertyDef => {
  const def = value as { key?: unknown; type?: unknown } | null
  if (typeof def !== 'object' || def === null || typeof def.key !== 'string' || !isPropertyType(def.type)) {
    throw new ApiError(200, 'a API respondeu uma propriedade num formato que não reconheço')
  }
  return { key: def.key, type: def.type }
}

/** `PropertiesPort` over HTTP: `/property-defs` (card #35), parsed at the boundary. */
export function httpPropertiesClient({ config, fetch }: { config: ApiConfig; fetch?: typeof globalThis.fetch }): PropertiesPort {
  const send = httpClient({ config, ...(fetch ? { fetch } : {}) })
  return {
    async list() {
      const answer = await send('/property-defs')
      if (!Array.isArray(answer)) throw new ApiError(200, 'a API respondeu as propriedades num formato que não reconheço')
      return answer.map(parseDef)
    },
    async define(key, type) {
      return parseDef(await send('/property-defs', { method: 'POST', body: JSON.stringify({ key, type }) }))
    },
  }
}
