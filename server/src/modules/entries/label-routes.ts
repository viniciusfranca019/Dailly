import { isLabelColor, normalizeLabelName, type LabelColor } from '@dailly/domain'
import type { FastifyInstance } from 'fastify'
import type { Invalid } from './validate.js'
import { LabelNameTakenError, LabelNotFoundError, type LabelStore } from './sqlite-label-store.js'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Name and color, each optional when `partial`; every problem at once. */
function validateLabel(
  payload: unknown,
  partial: boolean,
): { change: { name?: string; color?: LabelColor } } | { errors: Invalid[] } {
  if (!isRecord(payload)) return { errors: [{ field: '', message: 'o corpo da requisição deve ser um objeto JSON' }] }
  const errors: Invalid[] = Object.keys(payload)
    .filter((field) => field !== 'name' && field !== 'color')
    .map((field) => ({ field, message: 'não existe numa label' }))
  const change: { name?: string; color?: LabelColor } = {}

  if (payload.name !== undefined || !partial) {
    const name = typeof payload.name === 'string' ? normalizeLabelName(payload.name) : null
    if (name === null) errors.push({ field: 'name', message: 'o nome da label é obrigatório' })
    else change.name = name
  }
  if (payload.color !== undefined || !partial) {
    if (!isLabelColor(payload.color)) errors.push({ field: 'color', message: 'deve ser uma cor da paleta' })
    else change.color = payload.color
  }
  if (partial && errors.length === 0 && Object.keys(change).length === 0) {
    errors.push({ field: '', message: 'nada para mudar' })
  }
  return errors.length > 0 ? { errors } : { change }
}

/** `/labels`: the global labels (card #34), served by the Entries module. */
export function registerLabelRoutes(app: FastifyInstance, labels: LabelStore): void {
  const refuse = (error: unknown, reply: { code(n: number): { send(body: unknown): unknown } }) => {
    if (error instanceof LabelNameTakenError) return reply.code(409).send({ error: error.message })
    if (error instanceof LabelNotFoundError) return reply.code(404).send({ error: error.message })
    throw error
  }

  app.get('/labels', async () => labels.list())

  app.post('/labels', async (request, reply) => {
    const validated = validateLabel(request.body, false)
    if ('errors' in validated) return reply.code(400).send({ errors: validated.errors })
    try {
      return reply.code(201).send(labels.create(validated.change as { name: string; color: LabelColor }))
    } catch (error) {
      return refuse(error, reply)
    }
  })

  app.patch<{ Params: { id: string } }>('/labels/:id', async (request, reply) => {
    const validated = validateLabel(request.body, true)
    if ('errors' in validated) return reply.code(400).send({ errors: validated.errors })
    try {
      return labels.update(request.params.id, validated.change)
    } catch (error) {
      return refuse(error, reply)
    }
  })

  app.delete<{ Params: { id: string } }>('/labels/:id', async (request, reply) => {
    try {
      labels.delete(request.params.id)
      return reply.code(204).send()
    } catch (error) {
      return refuse(error, reply)
    }
  })
}
