import type { RequestStore, SavedRequest } from '@dailly/requests-core'
import {
  CorruptSpecError,
  FolderCycleError,
  FolderNotFoundError,
  InvalidSpecError,
  ProtocolRegistry,
  UnknownProtocolError,
  UnresolvedVariableError,
  resolve,
} from '@dailly/requests-core'
import { type HttpWire, httpDriver } from '@dailly/requests-core/http'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { InvalidWireError, TargetUnreachableError, executeHttp } from './execute.js'
import { validateFolder, validateSavedRequest } from './validate.js'

/**
 * Os protocolos que este servidor sabe montar — hoje um.
 *
 * O registry é montado aqui e não importado do pacote porque registrar é
 * composição: o dia em que existir um driver gRPC, ele entra nesta linha e
 * nada mais muda.
 */
const registry = new ProtocolRegistry().register(httpDriver)

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
  const answer = async <T>(reply: FastifyReply, work: () => Promise<T>) => {
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

  /**
   * Executar: a rota mais sensível desta API.
   *
   * Ela é egresso arbitrário para a internet a partir da máquina do usuário, e
   * a [ADR 0011](../../../../docs/adrs/0011-requests-modulo-e-execucao.md)
   * escreveu que ela fica **dentro** do hook do token, nunca na isenção do
   * `/health`. O hook é do shell e o caminho não começa com `/health`, então a
   * garantia é estrutural — e o teste a prende, porque uma garantia que só
   * existe no comentário não é garantia.
   *
   * A resposta não é guardada: ela vive enquanto a tela a mostra. Histórico de
   * execução é outra feature, com outro schema, e ninguém pediu.
   */
  app.post('/requests/:id/execute', async (request, reply) => {
    let saved
    try {
      saved = await store.requestById((request.params as { id: string }).id)
    } catch (error) {
      // Spec ilegível é recusa nomeada, não 500: o C4 diz que o banco é
      // fronteira de confiança, e um JSON quebrado é a forma mais crua disso.
      if (error instanceof CorruptSpecError) {
        return reply.code(422).send({ error: error.message })
      }
      throw error
    }
    if (!saved) return reply.code(404).send({ error: 'não existe request com esse id' })

    const body = request.body as { env?: unknown } | undefined
    const env = body?.env
    if (env !== undefined && (typeof env !== 'object' || env === null || Array.isArray(env))) {
      return reply.code(400).send({ errors: [{ field: 'env', message: 'deve ser um objeto' }] })
    }

    // **Todo valor tem que ser texto.** A interpolação devolve o que achar para
    // dentro de `replaceAll`, que serializa qualquer coisa: um objeto viraria
    // `[object Object]` na fita, um `null` viraria `"null"`. O C3 existe para
    // que um problema de variável seja pego antes de qualquer byte sair, e um
    // env malformado produzia em silêncio uma requisição que ninguém escreveu.
    const naoTexto = Object.entries((env ?? {}) as Record<string, unknown>)
      .filter(([, value]) => typeof value !== 'string')
      .map(([name]) => ({ field: `env.${name}`, message: 'deve ser texto' }))
    if (naoTexto.length > 0) return reply.code(400).send({ errors: naoTexto })

    let wire: HttpWire
    try {
      wire = resolve<HttpWire>(registry, saved, (env ?? {}) as Record<string, string>)
    } catch (error) {
      // As três recusas são do cliente, não do servidor — e cada uma diz o que
      // falta consertar. Um 500 mandaria procurar defeito aqui dentro.
      if (error instanceof UnresolvedVariableError) {
        return reply.code(400).send({
          error: error.message,
          missing: error.missing,
          surviving: error.surviving,
        })
      }
      if (error instanceof InvalidSpecError) {
        return reply.code(422).send({ error: error.message, errors: error.errors })
      }
      if (error instanceof UnknownProtocolError) {
        return reply.code(422).send({ error: error.message })
      }
      throw error
    }

    try {
      return await executeHttp(wire)
    } catch (error) {
      if (error instanceof InvalidWireError) {
        // 422 e não 502: a recusa é do spec, e aconteceu antes de qualquer
        // socket. Dizer 502 mandaria procurar na rede.
        return reply.code(422).send({ error: error.message })
      }
      if (error instanceof TargetUnreachableError) {
        // 502: quem falhou foi o alvo. Dizer 500 seria assumir a culpa de
        // outro processo, e mandar a pessoa depurar o lugar errado.
        return reply.code(502).send({ error: error.message })
      }
      throw error
    }
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
