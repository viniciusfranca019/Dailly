import { EntryNotFoundError, NotImplementedError, type EntryRepository } from '@dailly/domain'
import type { FastifyInstance } from 'fastify'
import { checkProps, parseFilter, validateEntry, validatePatch, validateRange } from './validate.js'
import type { PropertyDef } from '@dailly/domain'

/**
 * As rotas do Daily Log: o outro lado do `EntryRepository`.
 *
 * Deliberadamente finas. O domain roda no renderer, então não há use-case aqui
 * para chamar — estas rotas são um store com um validador na frente. Quando uma
 * rota começar a querer uma decisão, essa decisão pertence ao `@dailly/domain`,
 * onde os dois lados a enxergam.
 */
/**
 * A label id that is not in `labels` fails the foreign key of `entry_labels`
 * (card #34). It is the client's mistake, so a 400 naming the field, not a 500.
 */
const UNKNOWN_LABEL = { field: 'labelIds', message: 'contém uma label que não existe' }
const isUnknownLabel = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'SQLITE_CONSTRAINT_FOREIGNKEY'

export function registerEntryRoutes(
  app: FastifyInstance,
  entries: EntryRepository,
  /** The property definitions the values are checked against (card #35). */
  propertyDefs: () => readonly PropertyDef[],
): void {
  app.get('/entries', async (request, reply) => {
    const query = request.query as Record<string, unknown> & { from?: unknown; to?: unknown }
    const parsed = parseFilter(query, propertyDefs())
    const errors = [...validateRange(query), ...('errors' in parsed ? parsed.errors : [])]
    if (errors.length > 0 || 'errors' in parsed) return reply.code(400).send({ errors })

    try {
      return await entries.list({
        ...(query.from ? { from: query.from as string } : {}),
        ...(query.to ? { to: query.to as string } : {}),
        ...parsed.filter,
      })
    } catch (error) {
      // A store that refuses a filter (NotImplementedError) is not a server
      // failure; 500 would send the client looking in the wrong place. The
      // SQLite store filters everything since card #36, so only a store that
      // still refuses reaches this (the routes test pins the mapping).
      if (error instanceof NotImplementedError) {
        return reply.code(501).send({ error: error.message })
      }
      throw error
    }
  })

  app.post('/entries', async (request, reply) => {
    const validated = validateEntry(request.body)
    if ('errors' in validated) return reply.code(400).send({ errors: validated.errors })
    const wrongProps = checkProps(validated.entry.props, propertyDefs())
    if (wrongProps.length > 0) return reply.code(400).send({ errors: wrongProps })

    try {
      const created = await entries.create(validated.entry)
      return reply.code(201).send(created)
    } catch (error) {
      if (isUnknownLabel(error)) return reply.code(400).send({ errors: [UNKNOWN_LABEL] })
      throw error
    }
  })

  // One entry: read, correct, delete (card #33). Only day logs answer; the
  // Entry of a task is a 404 here (PRD RN6), as an unknown id is.
  const notFound = { error: new EntryNotFoundError().message }

  app.get<{ Params: { id: string } }>('/entries/:id', async (request, reply) => {
    const found = await entries.getById(request.params.id)
    return found ?? reply.code(404).send(notFound)
  })

  app.patch<{ Params: { id: string } }>('/entries/:id', async (request, reply) => {
    const validated = validatePatch(request.body)
    if ('errors' in validated) return reply.code(400).send({ errors: validated.errors })
    const wrongProps = validated.patch.props ? checkProps(validated.patch.props, propertyDefs()) : []
    if (wrongProps.length > 0) return reply.code(400).send({ errors: wrongProps })
    try {
      return await entries.update(request.params.id, validated.patch)
    } catch (error) {
      if (error instanceof EntryNotFoundError) return reply.code(404).send(notFound)
      if (isUnknownLabel(error)) return reply.code(400).send({ errors: [UNKNOWN_LABEL] })
      throw error
    }
  })

  app.delete<{ Params: { id: string } }>('/entries/:id', async (request, reply) => {
    try {
      await entries.delete(request.params.id)
      return reply.code(204).send()
    } catch (error) {
      if (error instanceof EntryNotFoundError) return reply.code(404).send(notFound)
      throw error
    }
  })
}
