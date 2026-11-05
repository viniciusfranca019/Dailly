import { isPropertyType, normalizePropertyKey } from '@dailly/domain'
import type { FastifyInstance } from 'fastify'
import type { Invalid } from './validate.js'
import { PropertyKeyTakenError, type PropertyDefStore } from './sqlite-property-defs.js'

/** `/property-defs`: the type of each property key (card #35), served by Entries. */
export function registerPropertyRoutes(app: FastifyInstance, defs: PropertyDefStore): void {
  app.get('/property-defs', async () => defs.list())

  app.post('/property-defs', async (request, reply) => {
    const body = (request.body ?? {}) as { key?: unknown; type?: unknown }
    const errors: Invalid[] = []
    const key = typeof body.key === 'string' ? normalizePropertyKey(body.key) : null
    if (key === null) errors.push({ field: 'key', message: 'a chave é obrigatória' })
    if (!isPropertyType(body.type)) errors.push({ field: 'type', message: 'deve ser texto, número ou sim/não' })
    if (errors.length > 0 || key === null || !isPropertyType(body.type)) return reply.code(400).send({ errors })
    try {
      return reply.code(201).send(defs.define(key, body.type))
    } catch (error) {
      if (error instanceof PropertyKeyTakenError) return reply.code(409).send({ error: error.message })
      throw error
    }
  })
}
