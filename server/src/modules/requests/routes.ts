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
import type { WireRequest } from '@dailly/requests-core'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { ExecutionTimeoutError, InvalidWireError, TargetUnreachableError } from './execute.js'
import { PROTOCOLS, type Protocol } from './protocols.js'
import { validateFolder, validateSavedRequest } from './validate.js'
import { CorruptSecretError, type Vault } from '../../shell/module.js'

/**
 * O ambiente do cofre que a execução lê. Um só por enquanto (ADR 0013): a
 * escolha de ambiente na tela vem com o importador do Apidog.
 */
const VAULT_ENVIRONMENT = 'default'

/**
 * As rotas de coleção: guardar, listar, apagar, organizar.
 *
 * Finas como as do entries, e pelo mesmo motivo — do outro lado da port há um
 * store, não um use-case. A única decisão que mora aqui é qual erro do domínio
 * vira qual status, e ela é feita uma vez, no `answer`.
 */
/** As variáveis existem no cofre, mas ele não está aberto — nada saiu para a rede. */
class LockedVariablesError extends Error {
  override readonly name = 'LockedVariablesError'
  constructor(
    readonly names: readonly string[],
    missingKey: boolean,
  ) {
    const which = `${names.length === 1 ? 'a variável' : 'as variáveis'} ${names.join(', ')}`
    super(
      missingKey
        ? `${which} só existe${names.length === 1 ? '' : 'm'} no cofre, e falta a DAILLY_SECRET_KEY no .env ` +
            'para abri-lo com a senha (ou abra com a chave de recuperação)'
        : `o cofre está trancado, e ${which} só existe${names.length === 1 ? '' : 'm'} nele: abra o cofre com a senha`,
    )
  }
}

/**
 * Troca cada valor vindo do cofre por `{{nome}}` numa mensagem.
 *
 * As recusas da execução citam a URL já resolvida ("não consegui alcançar
 * …"), e um segredo interpolado na URL voltava em claro no corpo do 502. A
 * ADR 0013 diz que nenhuma mensagem de erro carrega um valor; esta é a borda
 * onde isso se cumpre, porque é aqui que se sabe quais valores vieram do cofre.
 */
const redact = (message: string, secrets: ReadonlyMap<string, string>): string => {
  // O mais longo primeiro: com `sk_live` e `sk_live_9f8e` no cofre, trocar o
  // curto antes deixava `{{curto}}_9f8e` — o resto do longo em claro.
  const forms = [...secrets].flatMap(([name, value]) => {
    const encoded = encodeURIComponent(value)
    return encoded === value ? [{ name, text: value }] : [{ name, text: value }, { name, text: encoded }]
  })
  return forms
    .filter((form) => form.text !== '')
    .sort((a, b) => b.text.length - a.text.length)
    .reduce((out, form) => out.replaceAll(form.text, `{{${form.name}}}`), message)
}

export function registerRequestRoutes(
  app: FastifyInstance,
  store: RequestStore,
  protocols: readonly Protocol[] = PROTOCOLS,
  vault?: Vault,
): void {
  // O registry é montado da lista, e não importado do pacote, porque registrar
  // é composição: o dia em que existir gRPC, ele entra em `PROTOCOLS` e nada
  // aqui muda. O mapa ao lado é a metade efetiva, escolhida pela mesma chave.
  const registry = protocols.reduce((r, p) => r.register(p.driver), new ProtocolRegistry())
  const executors = new Map(protocols.map((p) => [p.driver.protocol, p] as const))

  /**
   * Resolve com o `env` da tela e, para o que faltar, com o cofre.
   *
   * A tela vale primeiro porque é a escolha do momento. O cofre só é tocado
   * quando a tela não basta, e então só pelos nomes que faltaram: um cofre
   * trancado não impede uma request que não precisa dele.
   */
  const resolveWithVault = (
    saved: SavedRequest,
    env: Record<string, string>,
  ): { wire: WireRequest; secrets: ReadonlyMap<string, string> } => {
    try {
      return { wire: resolve(registry, saved, env), secrets: new Map() }
    } catch (error) {
      if (!(error instanceof UnresolvedVariableError) || !vault) throw error
      const stored = error.missing.filter((name) => vault.has(VAULT_ENVIRONMENT, name))
      if (stored.length === 0) throw error
      const state = vault.status().state
      if (state !== 'aberto') throw new LockedVariablesError(stored, state === 'sem-chave')
      const secrets = new Map(stored.map((name) => [name, vault.get(VAULT_ENVIRONMENT, name)] as const))
      return { wire: resolve(registry, saved, { ...Object.fromEntries(secrets), ...env }), secrets }
    }
  }

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

    let wire: WireRequest
    let secrets: ReadonlyMap<string, string>
    try {
      ;({ wire, secrets } = resolveWithVault(saved, (env ?? {}) as Record<string, string>))
    } catch (error) {
      // 422 como nas rotas do cofre: a linha foi alterada por fora, e um 500
      // mandaria procurar o defeito aqui dentro.
      if (error instanceof CorruptSecretError) return reply.code(422).send({ error: error.message })
      if (error instanceof LockedVariablesError) {
        // 423, e não 400: a variável existe, só está trancada. Mandar "falta
        // variável" faria a pessoa procurar um valor que já está guardado.
        return reply.code(423).send({ error: error.message, locked: error.names })
      }
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
      // Driver e executor vêm do mesmo `Protocol`, e o `resolve` já recusou
      // protocolo sem driver — então isto não acontece. A recusa existe para
      // que, se um dia acontecer, seja nomeada, e não um `TypeError` em 500.
      const protocol = executors.get(saved.protocol)
      if (!protocol) {
        return reply.code(422).send({ error: `nenhum executor para o protocolo "${saved.protocol}"` })
      }
      return await protocol.execute(wire)
    } catch (error) {
      if (error instanceof InvalidWireError) {
        // 422 e não 502: a recusa é do spec, e aconteceu antes de qualquer
        // socket. Dizer 502 mandaria procurar na rede.
        return reply.code(422).send({ error: redact(error.message, secrets) })
      }
      if (error instanceof ExecutionTimeoutError) {
        // 504 e não 502: o alvo foi alcançado e respondeu — ele só não
        // terminou no prazo que **este** servidor impõe.
        return reply.code(504).send({ error: redact(error.message, secrets) })
      }
      if (error instanceof TargetUnreachableError) {
        // 502: quem falhou foi o alvo. Dizer 500 seria assumir a culpa de
        // outro processo, e mandar a pessoa depurar o lugar errado.
        return reply.code(502).send({ error: redact(error.message, secrets) })
      }
      throw error
    }
  })

  app.delete('/requests/:id', async (request, reply) => {
    await store.deleteRequest((request.params as { id: string }).id)
    return reply.code(204).send()
  })

  app.delete('/requests/folders/:id', async (request, reply) =>
    answer(reply, async () => {
      await store.deleteFolder((request.params as { id: string }).id)
      return reply.code(204).send()
    }),
  )

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
