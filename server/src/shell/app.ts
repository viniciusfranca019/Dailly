import Fastify, { type FastifyInstance } from 'fastify'
import { MODULES } from '../modules.js'
import type { Database } from 'better-sqlite3'
import {
  ManifestError,
  assertManifest,
  type ServerModule,
  type ServerModuleDeps,
} from './module.js'

export interface AppDeps extends ServerModuleDeps {
  /** Quando presente, toda requisição precisa trazer `Authorization: Bearer <token>`. */
  readonly token?: string
  /**
   * O banco, oferecido aos módulos que constroem a própria dependência.
   *
   * Ausente num `buildApp` de teste que só monta módulos sem `provide` — e é
   * por isso que a falta dele é um erro nomeado e não um `!`: um módulo que
   * precisa de banco sem banco deve dizer qual módulo é, não quebrar na
   * primeira rota com `undefined`.
   */
  readonly db?: Database
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
  { entries, zone, token, db }: AppDeps,
  modules: readonly ServerModule<unknown>[] = MODULES,
): FastifyInstance {
  assertManifest(modules)

  const app = Fastify({ logger: false })

  if (token) {
    app.addHook('onRequest', async (request, reply) => {
      // `/health` é isento: o shell faz polling nele para saber quando o
      // servidor subiu, e ele não responde nada que um processo desta máquina
      // não pudesse descobrir olhando a porta.
      //
      // **A isenção é a rota registrada, não o prefixo da URL.** Com
      // `startsWith('/health')` a linha era correta enquanto o shell era dono
      // de toda rota — `/health` era a única string que casava. Módulo no
      // manifest muda isso: `/healthz` e `/health/executor` casam também, e aí
      // a isenção vira bypass de autenticação. O `url` também carrega query
      // string, então comparar com ele quebraria `/health?probe=1`.
      if (request.routeOptions.url === '/health') return

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

  for (const module of modules) {
    if (!module.provide) {
      module.register(app, { entries, zone }, undefined)
      continue
    }
    if (!db) {
      throw new ManifestError(
        `o módulo ${module.id} constrói a própria dependência e precisa do banco, ` +
          'mas `buildApp` foi chamado sem ele.',
      )
    }
    module.register(app, { entries, zone }, module.provide({ db, zone }))
  }

  return app
}
