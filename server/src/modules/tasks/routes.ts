import {
  InvalidCategoryError,
  InvalidColorError,
  InvalidMoveToError,
  LastStatusError,
  StatusHasTasksError,
  StatusNameTakenError,
  type StatusPatch,
  BoardNotFoundError,
  CommentRequiredError,
  InvalidPrefixError,
  NameRequiredError,
  PrefixTakenError,
  InvalidPriorityError,
  InvalidRankError,
  StatusNotFoundError,
  TitleRequiredError,
  parseKey,
  type BoardPatch,
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

const BOARD_PATCHABLE: readonly string[] = ['name', 'prefix']

/** The shape of a board's PATCH; as with tasks, an unknown field is refused, not ignored. */
function parseBoardPatch(body: unknown): { patch: BoardPatch } | { errors: Invalid[] } {
  if (!isRecord(body)) return { errors: [{ field: '', message: 'o corpo deve ser um objeto JSON' }] }
  const errors: Invalid[] = []
  const keys = Object.keys(body)
  for (const key of keys.filter((name) => !BOARD_PATCHABLE.includes(name))) {
    errors.push({ field: key, message: 'não é um campo que se edita' })
  }
  if (keys.length === 0) errors.push({ field: '', message: 'nenhum campo para salvar' })
  const { name, prefix } = body
  if (name !== undefined && typeof name !== 'string') errors.push({ field: 'name', message: 'deve ser texto' })
  if (prefix !== undefined && typeof prefix !== 'string') errors.push({ field: 'prefix', message: 'deve ser texto' })
  if (errors.length > 0) return { errors }
  return {
    patch: {
      ...(name !== undefined ? { name: name as string } : {}),
      ...(prefix !== undefined ? { prefix: prefix as string } : {}),
    },
  }
}

/** The board refusals: the shape ones name a field (400), a prefix in use is a conflict (409). */
function refuseBoard(error: unknown): { code: number; body: unknown } | null {
  if (error instanceof NameRequiredError) return { code: 400, body: { errors: [{ field: 'name', message: error.message }] } }
  if (error instanceof InvalidPrefixError) {
    return { code: 400, body: { errors: [{ field: 'prefix', message: error.message }] } }
  }
  if (error instanceof PrefixTakenError) return { code: 409, body: { error: error.message } }
  return null
}

const TASK_NOT_FOUND = { error: 'tarefa não encontrada' }

/** A comment's POST body: `body`, text, and nothing else (card #45's Latitude). */
function parseComment(body: unknown): { text: string } | { errors: Invalid[] } {
  if (!isRecord(body)) return { errors: [{ field: '', message: 'o corpo deve ser um objeto JSON' }] }
  const errors: Invalid[] = Object.keys(body)
    .filter((name) => name !== 'body')
    .map((field) => ({ field, message: 'não é um campo do comentário' }))
  if (typeof body.body !== 'string') errors.push({ field: 'body', message: 'deve ser texto' })
  return errors.length > 0 ? { errors } : { text: body.body as string }
}

/** Only the named fields, each text; the values are the store's to judge. */
function onlyText(
  body: unknown,
  allowed: readonly string[],
  required: readonly string[],
): { values: Record<string, string> } | { errors: Invalid[] } {
  if (!isRecord(body)) return { errors: [{ field: '', message: 'o corpo deve ser um objeto JSON' }] }
  const keys = Object.keys(body)
  const errors: Invalid[] = keys
    .filter((name) => !allowed.includes(name))
    .map((field) => ({ field, message: 'não é um campo que se edita' }))
  if (keys.length === 0) errors.push({ field: '', message: 'nenhum campo para salvar' })
  for (const field of allowed) {
    const value = body[field]
    if (value === undefined ? required.includes(field) : typeof value !== 'string') {
      errors.push({ field, message: 'deve ser texto' })
    }
  }
  if (errors.length > 0) return { errors }
  return { values: Object.fromEntries(keys.map((key) => [key, body[key] as string])) }
}

/** The status refusals (card #43): the shape ones name a field (400), the conflicts are 409. */
function refuseStatus(error: unknown): { code: number; body: unknown } | null {
  const field = (name: string, message: string) => ({ code: 400, body: { errors: [{ field: name, message }] } })
  if (error instanceof NameRequiredError) return field('name', error.message)
  if (error instanceof InvalidCategoryError) return field('category', error.message)
  if (error instanceof InvalidColorError) return field('color', error.message)
  if (error instanceof InvalidMoveToError) return field('moveTo', error.message)
  if (error instanceof StatusNameTakenError || error instanceof StatusHasTasksError || error instanceof LastStatusError) {
    return { code: 409, body: { error: error.message } }
  }
  return null
}

const STATUS_NOT_FOUND = { error: 'status não encontrado' }

const BOARD_REQUIRED = { errors: [{ field: 'boardId', message: 'o board é obrigatório' }] }
const BOARD_NOT_FOUND = { error: 'board não encontrado' }

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
 * observable after a delete (card #20, C4). F4 (card #42) adds the boards:
 * `/tasks` stays the one path to a task, scoped by `boardId`, with no default
 * board hidden in the server; a task is found by its whole key (`CASA-3`),
 * unique across boards by RN9.
 */
export function registerTaskRoutes(app: FastifyInstance, store: TaskStore): void {
  app.get('/boards', async () => store.boards())

  app.post('/boards', async (request, reply) => {
    const body = request.body
    if (!isRecord(body) || typeof body.name !== 'string' || typeof body.prefix !== 'string') {
      return reply.code(400).send({
        errors: [{ field: '', message: 'o corpo deve ter name e prefix, os dois texto' }],
      })
    }
    try {
      return reply.code(201).send(await store.createBoard({ name: body.name, prefix: body.prefix }))
    } catch (error) {
      const refusal = refuseBoard(error)
      if (refusal) return reply.code(refusal.code).send(refusal.body)
      throw error
    }
  })

  app.patch('/boards/:id', async (request, reply) => {
    const parsed = parseBoardPatch(request.body)
    if ('errors' in parsed) return reply.code(400).send({ errors: parsed.errors })
    try {
      const updated = await store.updateBoard((request.params as { id: string }).id, parsed.patch)
      if (!updated) return reply.code(404).send(BOARD_NOT_FOUND)
      return updated
    } catch (error) {
      const refusal = refuseBoard(error)
      if (refusal) return reply.code(refusal.code).send(refusal.body)
      throw error
    }
  })

  // The statuses of a board (card #43). A new one is created under its board;
  // edited and deleted by its own id, unique across boards.
  app.post('/boards/:id/statuses', async (request, reply) => {
    const parsed = onlyText(request.body, ['name', 'category', 'color'], ['name', 'category', 'color'])
    if ('errors' in parsed) return reply.code(400).send({ errors: parsed.errors })
    const { name, category, color } = parsed.values as { name: string; category: string; color: string }
    try {
      const status = await store.addStatus((request.params as { id: string }).id, {
        name,
        category: category as never,
        color: color as never,
      })
      if (!status) return reply.code(404).send(BOARD_NOT_FOUND)
      return reply.code(201).send(status)
    } catch (error) {
      const refusal = refuseStatus(error)
      if (refusal) return reply.code(refusal.code).send(refusal.body)
      throw error
    }
  })

  app.patch('/statuses/:id', async (request, reply) => {
    const parsed = onlyText(request.body, ['name', 'color'], [])
    if ('errors' in parsed) return reply.code(400).send({ errors: parsed.errors })
    try {
      const status = await store.updateStatus((request.params as { id: string }).id, parsed.values as StatusPatch)
      if (!status) return reply.code(404).send(STATUS_NOT_FOUND)
      return status
    } catch (error) {
      const refusal = refuseStatus(error)
      if (refusal) return reply.code(refusal.code).send(refusal.body)
      throw error
    }
  })

  app.delete('/statuses/:id', async (request, reply) => {
    const { moveTo } = request.query as { moveTo?: unknown }
    if (moveTo !== undefined && (typeof moveTo !== 'string' || moveTo === '')) {
      return reply.code(400).send({ errors: [{ field: 'moveTo', message: 'deve ser o id de um status' }] })
    }
    try {
      const deleted = await store.deleteStatus((request.params as { id: string }).id, moveTo)
      if (!deleted) return reply.code(404).send(STATUS_NOT_FOUND)
      return reply.code(204).send()
    } catch (error) {
      const refusal = refuseStatus(error)
      if (refusal) return reply.code(refusal.code).send(refusal.body)
      throw error
    }
  })

  app.get('/tasks', async (request, reply) => {
    const { boardId } = request.query as { boardId?: unknown }
    if (typeof boardId !== 'string' || boardId === '') return reply.code(400).send(BOARD_REQUIRED)
    const board = await store.board(boardId)
    if (!board) return reply.code(404).send(BOARD_NOT_FOUND)
    return board
  })

  app.post('/tasks', async (request, reply) => {
    const body = request.body
    if (isRecord(body) && (typeof body.boardId !== 'string' || body.boardId === '')) {
      return reply.code(400).send(BOARD_REQUIRED)
    }
    if (!isRecord(body) || typeof body.title !== 'string' || typeof body.statusId !== 'string') {
      return reply.code(400).send({
        errors: [{ field: '', message: 'o corpo deve ter boardId, title e statusId, os três texto' }],
      })
    }
    try {
      return reply
        .code(201)
        .send(await store.create({ boardId: body.boardId as string, title: body.title, statusId: body.statusId }))
    } catch (error) {
      if (error instanceof BoardNotFoundError) return reply.code(404).send(BOARD_NOT_FOUND)
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

  // The comments of a task (card #45): read in a GET of their own, so the
  // board and the list stay one query (RN4) and never carry them.
  app.get('/tasks/:key/comments', async (request, reply) => {
    const key = parseKey((request.params as { key: string }).key)
    const comments = key === null ? null : await store.comments(key)
    if (!comments) return reply.code(404).send(TASK_NOT_FOUND)
    return comments
  })

  app.post('/tasks/:key/comments', async (request, reply) => {
    const key = parseKey((request.params as { key: string }).key)
    const parsed = parseComment(request.body)
    if ('errors' in parsed) return reply.code(400).send({ errors: parsed.errors })
    try {
      const comment = key === null ? null : await store.addComment(key, parsed.text)
      if (!comment) return reply.code(404).send(TASK_NOT_FOUND)
      return reply.code(201).send(comment)
    } catch (error) {
      if (error instanceof CommentRequiredError) {
        return reply.code(400).send({ errors: [{ field: 'body', message: error.message }] })
      }
      throw error
    }
  })

  app.delete('/tasks/:key/comments/:id', async (request, reply) => {
    const params = request.params as { key: string; id: string }
    const key = parseKey(params.key)
    const outcome = key === null ? 'task-not-found' : await store.deleteComment(key, params.id)
    if (outcome === 'task-not-found') return reply.code(404).send(TASK_NOT_FOUND)
    if (outcome === 'comment-not-found') return reply.code(404).send({ error: 'comentário não encontrado' })
    return reply.code(204).send()
  })

  app.delete('/tasks/:key', async (request, reply) => {
    const key = parseKey((request.params as { key: string }).key)
    if (key === null || !(await store.delete(key))) {
      return reply.code(404).send({ error: 'tarefa não encontrada' })
    }
    return reply.code(204).send()
  })
}
