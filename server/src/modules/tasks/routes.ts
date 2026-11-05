import {
  InvalidPriorityError,
  InvalidRankError,
  StatusNotFoundError,
  TitleRequiredError,
  parseKey,
  type Priority,
  type TaskPatch,
  type TaskStore,
} from '@dailly/tasks-core'
import type { FastifyInstance } from 'fastify'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The store's refusals, each naming the field the person can fix. */
const REFUSALS: readonly (readonly [new (...args: never[]) => Error, string])[] = [
  [TitleRequiredError, 'title'],
  [InvalidPriorityError, 'priority'],
  [StatusNotFoundError, 'statusId'],
  [InvalidRankError, 'rank'],
]

const PATCHABLE: readonly string[] = ['title', 'priority', 'body', 'statusId', 'rank']

interface Invalid {
  readonly field: string
  readonly message: string
}

/** The shape of a PATCH body; the values themselves are the store's to judge. */
function parsePatch(body: unknown): { patch: TaskPatch } | { errors: Invalid[] } {
  if (!isRecord(body)) return { errors: [{ field: '', message: 'o corpo deve ser um objeto JSON' }] }
  const errors: Invalid[] = []
  const keys = Object.keys(body)
  // Anything the panel or the board does not send is refused, not ignored
  // (the card's Latitude): a silent 200 would also move the Entry's updated_at.
  for (const key of keys.filter((name) => !PATCHABLE.includes(name))) {
    errors.push({ field: key, message: 'não é um campo que se edita' })
  }
  if (keys.length === 0) errors.push({ field: '', message: 'nenhum campo para salvar' })
  const { title, priority, body: text, statusId, rank } = body
  if (title !== undefined && typeof title !== 'string') errors.push({ field: 'title', message: 'deve ser texto' })
  if (priority !== undefined && typeof priority !== 'number') {
    errors.push({ field: 'priority', message: 'deve ser um número de 0 a 4' })
  }
  if (text !== undefined && typeof text !== 'string') errors.push({ field: 'body', message: 'deve ser texto' })
  if ((statusId === undefined) !== (rank === undefined) || (statusId !== undefined && (typeof statusId !== 'string' || typeof rank !== 'string'))) {
    errors.push({ field: 'statusId', message: 'statusId e rank vão juntos, os dois texto' })
  }
  if (errors.length > 0) return { errors }
  return {
    patch: {
      ...(title !== undefined ? { title: title as string } : {}),
      ...(priority !== undefined ? { priority: priority as Priority } : {}),
      ...(text !== undefined ? { body: text as string } : {}),
      ...(statusId !== undefined ? { placement: { statusId: statusId as string, rank: rank as string } } : {}),
    },
  }
}

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

  // One save, any subset (card #22): the board's drag sends a status with a
  // rank (computed by the screen with `placeAt`), the panel the fields the
  // person edited. A status without a rank is refused: the order is the
  // screen's to compute, never a default the server would guess.
  app.patch('/tasks/:key', async (request, reply) => {
    const key = parseKey((request.params as { key: string }).key)
    const parsed = parsePatch(request.body)
    if ('errors' in parsed) return reply.code(400).send({ errors: parsed.errors })
    try {
      const updated = key === null ? null : await store.update(key, parsed.patch)
      if (!updated) return reply.code(404).send({ error: 'tarefa não encontrada' })
      return updated
    } catch (error) {
      for (const [type, field] of REFUSALS) {
        if (error instanceof type) return reply.code(400).send({ errors: [{ field, message: error.message }] })
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
