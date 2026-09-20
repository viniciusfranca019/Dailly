import type { RequestStore, SavedRequest } from '@dailly/requests-core'
import { FolderCycleError, FolderNotFoundError } from '@dailly/requests-core'
import type { FastifyInstance } from 'fastify'
import { validateFolder, validateSavedRequest } from './validate.js'

/**
 * As rotas de coleção: guardar, listar, apagar, organizar.
 *
 * Finas como as do entries, e pelo mesmo motivo — do outro lado da port há um
 * store, não um use-case. A única decisão que mora aqui é qual erro do domínio
 * vira qual status, e ela é feita uma vez, no `answer`.
 */
export function registerRequestRoutes(app: FastifyInstance, store: RequestStore): void {
  /**
   * Traduz o vocabulário do domínio para HTTP, num lugar só.
   *
   * Espalhar `try/catch` por rota faria cada uma escolher o seu status, e a
   * primeira que esquecesse devolveria 500 para uma recusa legítima — que é
   * mandar quem chama procurar um defeito que não existe.
   */
  const answer = async <T>(reply: Parameters<typeof app.get>[1] extends never ? never : any, work: () => Promise<T>) => {
    try {
      return await work()
    } catch (error) {
      if (error instanceof FolderNotFoundError) return reply.code(404).send({ error: error.message })
      if (error instanceof FolderCycleError) return reply.code(409).send({ error: error.message })
      throw error
    }
  }

  app.get('/requests', async () => store.requests())
  app.get('/requests/folders', async () => store.folders())

  app.post('/requests', async (request, reply) => {
    const validated = validateSavedRequest(request.body)
    if ('errors' in validated) return reply.code(400).send({ errors: validated.errors })

    return answer(reply, async () => {
      const saved = await store.saveRequest(validated.request as SavedRequest)
      return reply.code(201).send(saved)
    })
  })

  app.delete('/requests/:id', async (request, reply) => {
    await store.deleteRequest((request.params as { id: string }).id)
    return reply.code(204).send()
  })

  app.post('/requests/folders', async (request, reply) => {
    const validated = validateFolder(request.body)
    if ('errors' in validated) return reply.code(400).send({ errors: validated.errors })

    return answer(reply, async () => {
      const saved = await store.saveFolder(validated.folder)
      return reply.code(201).send(saved)
    })
  })

  app.patch('/requests/folders/:id', async (request, reply) => {
    const body = request.body as { parentId?: unknown }
    if (body?.parentId !== null && typeof body?.parentId !== 'string') {
      return reply.code(400).send({ errors: [{ field: 'parentId', message: 'deve ser um id ou nulo' }] })
    }

    return answer(reply, async () => {
      await store.moveFolder((request.params as { id: string }).id, body.parentId as string | null)
      return reply.code(204).send()
    })
  })
}
