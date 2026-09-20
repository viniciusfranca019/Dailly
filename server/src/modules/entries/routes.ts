import { NotImplementedError } from '@dailly/domain'
import type { FastifyInstance } from 'fastify'
import type { ServerModuleDeps } from '../../shell/module.js'
import { validateEntry, validateRange } from './validate.js'

/**
 * As rotas do Daily Log: o outro lado do `EntryRepository`.
 *
 * Deliberadamente finas. O domain roda no renderer, então não há use-case aqui
 * para chamar — estas rotas são um store com um validador na frente. Quando uma
 * rota começar a querer uma decisão, essa decisão pertence ao `@dailly/domain`,
 * onde os dois lados a enxergam.
 */
export function registerEntryRoutes(app: FastifyInstance, { entries }: ServerModuleDeps): void {
  app.get('/entries', async (request, reply) => {
    const query = request.query as { from?: unknown; to?: unknown }
    const errors = validateRange(query)
    if (errors.length > 0) return reply.code(400).send({ errors })

    try {
      return await entries.list({
        ...(query.from ? { from: query.from as string } : {}),
        ...(query.to ? { to: query.to as string } : {}),
      })
    } catch (error) {
      // Um filtro que o roadmap põe na Fase 2 não é falha do servidor; dizer
      // 500 mandaria o cliente procurar no lugar errado.
      if (error instanceof NotImplementedError) {
        return reply.code(501).send({ error: error.message })
      }
      throw error
    }
  })

  app.post('/entries', async (request, reply) => {
    const validated = validateEntry(request.body)
    if ('errors' in validated) return reply.code(400).send({ errors: validated.errors })

    const created = await entries.create(validated.entry)
    return reply.code(201).send(created)
  })
}
