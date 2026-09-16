import type { EntryRepository } from '@dailly/domain'
import { NotImplementedError } from '@dailly/domain'
import type { TimeZone } from '@dailly/periods'
import Fastify, { type FastifyInstance } from 'fastify'
import { validateEntry, validateRange } from './validate.js'

export interface AppDeps {
  readonly entries: EntryRepository
  readonly zone: TimeZone
  /** When set, every request must carry `Authorization: Bearer <token>`. */
  readonly token?: string
}

/**
 * The HTTP surface: the other side of `EntryRepository`.
 *
 * Deliberately thin. The domain runs on the renderer, so there is no use-case
 * here to call — these routes are a store with a validator in front. When a
 * route starts wanting a decision, that decision belongs in `@dailly/domain`,
 * where both sides can see it.
 *
 * Built separately from `createServer` so a test can drive it through
 * `app.inject()` without a socket, and the one integration test that must use a
 * real socket (ADR 0009) is the exception rather than the rule.
 */
export function buildApp({ entries, zone, token }: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false })

  if (token) {
    app.addHook('onRequest', async (request, reply) => {
      // `/health` is exempt: the shell polls it to know when the server is up,
      // and it answers nothing a process on this machine could not already
      // learn by looking at the port.
      if (request.url.startsWith('/health')) return

      const header = request.headers.authorization
      if (header !== `Bearer ${token}`) {
        await reply.code(401).send({ error: 'não autorizado' })
      }
    })
  }

  app.get('/health', async () => ({
    status: 'ok',
    // The renderer reads the zone from here. ADR 0007 requires the UI to always
    // show which zone is in use, and this is the only process that knows: it is
    // an environment variable of *this* process.
    zone,
  }))

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
      // A filter the roadmap puts in Fase 2 is not a server fault; saying 500
      // would send the client looking in the wrong place.
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

  return app
}
