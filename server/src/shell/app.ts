import Fastify, { type FastifyInstance } from 'fastify'
import { MODULES } from '../modules.js'
import type { Database } from 'better-sqlite3'
import {
  ManifestError,
  assertManifest,
  type AnyServerModule,
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
  modules: readonly AnyServerModule[] = MODULES,
): FastifyInstance {
  assertManifest(modules)

  const app = Fastify({ logger: false })

  /**
   * Só a própria máquina fala com esta API (ADR 0012).
   *
   * Sem o Electron, o cliente é um navegador, que também abre outros sites. O
   * modelo de ameaça é esse e não "outro processo local": um processo desta
   * máquina já lê o SQLite direto, então protegê-lo da API não protege nada.
   *
   * - **Host** fecha o DNS rebinding: um site que faz seu domínio resolver
   *   para 127.0.0.1 ainda manda o próprio nome no `Host`.
   * - **Origin** fecha o CSRF: um `POST` `text/plain` de outro site não passa
   *   por preflight, e chegaria ao `/execute` — egresso a partir desta máquina.
   *   Sem `Origin` é curl, teste ou o proxy do vite num GET: passa.
   *
   * Sem isenção para o `/health`: a do token existe porque o shell fazia
   * polling antes de ter o token, e aqui não há o que esperar.
   */
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin
    const local =
      isLoopback(hostnameOf(request.headers.host)) &&
      (origin === undefined || isLoopback(hostnameOf(origin, '')))
    if (!local) await reply.code(403).send({ error: 'só esta máquina fala com a API' })
  })

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

/** Os nomes desta máquina. `URL` devolve o IPv6 entre colchetes. */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

const isLoopback = (hostname: string | undefined): boolean =>
  hostname !== undefined && LOOPBACK.has(hostname)

/**
 * O hostname de um `Host` (`localhost:4317`) ou de um `Origin`
 * (`http://localhost:5173`), sem porta. Pelo `URL` e não por `split(':')`,
 * que quebraria no IPv6. Ilegível — `Origin: null` incluído — é `undefined`,
 * e `undefined` não é desta máquina.
 */
function hostnameOf(value: string | undefined, scheme = 'http://'): string | undefined {
  if (!value) return undefined
  try {
    return new URL(`${scheme}${value}`).hostname
  } catch {
    return undefined
  }
}
