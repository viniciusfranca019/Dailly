import {
  InvalidRankError,
  StatusNotFoundError,
  TitleRequiredError,
  parseKey,
  type TaskStore,
} from '@dailly/tasks-core'
import type { FastifyInstance } from 'fastify'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The Tasks routes. Board and list read the same `GET /tasks` (RN4); F2 adds
 * the move, F3 the panel. `DELETE` is here in F1 because RN5 is only
 * observable after a delete (card #20, C4).
 */
export function registerTaskRoutes(app: FastifyInstance, store: TaskStore): void {
  app.get('/tasks', async () => store.board())

  app.post('/tasks', async (request, reply) => {
    const body = request.body
    if (!isRecord(body) || typeof body.title !== 'string' || typeof body.statusId !== 'string') {
      return reply.code(400).send({
        errors: [{ field: '', message: 'o corpo deve ter title e statusId, os dois texto' }],
      })
    }
    try {
      return reply.code(201).send(await store.create({ title: body.title, statusId: body.statusId }))
    } catch (error) {
      if (error instanceof TitleRequiredError) {
        return reply.code(400).send({ errors: [{ field: 'title', message: error.message }] })
      }
      if (error instanceof StatusNotFoundError) {
        return reply.code(400).send({ errors: [{ field: 'statusId', message: error.message }] })
      }
      throw error
    }
  })

  // The only move the board makes (card #21): a status and a rank, computed by
  // the screen from the neighbours with `placeAt`. RN3 is the store's.
  app.patch('/tasks/:key', async (request, reply) => {
    const key = parseKey((request.params as { key: string }).key)
    const body = request.body
    if (!isRecord(body) || typeof body.statusId !== 'string' || typeof body.rank !== 'string') {
      return reply.code(400).send({
        errors: [{ field: '', message: 'o corpo deve ter statusId e rank, os dois texto' }],
      })
    }
    try {
      const moved = key === null ? null : await store.move(key, { statusId: body.statusId, rank: body.rank })
      if (!moved) return reply.code(404).send({ error: 'tarefa não encontrada' })
      return moved
    } catch (error) {
      if (error instanceof StatusNotFoundError) {
        return reply.code(400).send({ errors: [{ field: 'statusId', message: error.message }] })
      }
      if (error instanceof InvalidRankError) {
        return reply.code(400).send({ errors: [{ field: 'rank', message: error.message }] })
      }
      throw error
    }
  })

  app.delete('/tasks/:key', async (request, reply) => {
    const key = parseKey((request.params as { key: string }).key)
    if (key === null || !(await store.delete(key))) {
      return reply.code(404).send({ error: 'tarefa não encontrada' })
    }
    return reply.code(204).send()
  })
}
