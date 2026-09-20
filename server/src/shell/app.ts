import Fastify, { type FastifyInstance } from 'fastify'
import { MODULES } from '../modules.js'
import { assertManifest, type ServerModule, type ServerModuleDeps } from './module.js'

export interface AppDeps extends ServerModuleDeps {
  /** Quando presente, toda requisição precisa trazer `Authorization: Bearer <token>`. */
  readonly token?: string
}

/**
 * O shell do servidor: o processo, a autenticação, o `/health` — e o laço que
 * monta os módulos do manifest.
 *
 * O que fica aqui é o que não é de módulo nenhum. `/health` é o exemplo exato:
 * ele responde a zona, e a zona é variável de ambiente *deste processo*
 * (ADR 0007), não material do Daily Log.
 *
 * Construído separado do `createServer` para que um teste possa dirigi-lo por
 * `app.inject()` sem socket, e o único teste de integração que precisa de
 * socket de verdade (ADR 0009) seja a exceção, não a regra.
 */
export function buildApp(
  { entries, zone, token }: AppDeps,
  modules: readonly ServerModule[] = MODULES,
): FastifyInstance {
  assertManifest(modules)

  const app = Fastify({ logger: false })

  if (token) {
    app.addHook('onRequest', async (request, reply) => {
      // `/health` é isento: o shell faz polling nele para saber quando o
      // servidor subiu, e ele não responde nada que um processo desta máquina
      // não pudesse descobrir olhando a porta.
      //
      // A isenção é nominal de propósito. Qualquer rota de módulo — inclusive
      // uma que faça requisição para fora — entra pelo hook como todas as
      // outras.
      if (request.url.startsWith('/health')) return

      const header = request.headers.authorization
      if (header !== `Bearer ${token}`) {
        await reply.code(401).send({ error: 'não autorizado' })
      }
    })
  }

  app.get('/health', async () => ({
    status: 'ok',
    // O renderer lê a zona daqui. A ADR 0007 exige que a UI sempre mostre qual
    // zona está em uso, e este é o único processo que sabe.
    zone,
  }))

  for (const module of modules) module.register(app, { entries, zone })

  return app
}
