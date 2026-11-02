import type { FastifyInstance, FastifyReply } from 'fastify'
import {
  CorruptSecretError,
  MissingSecretKeyError,
  SecretNotFoundError,
  VaultExistsError,
  VaultLockedError,
  VaultNotCreatedError,
  WrongPasswordError,
  type Vault,
} from '../../shell/module.js'

/** O ambiente: um rótulo simples, como `default` ou `staging`. */
const ENVIRONMENT = /^[A-Za-z0-9_.-]{1,64}$/
/**
 * O nome: tem que poder ser escrito como `{{nome}}`, então sem espaço e sem
 * chave — a mesma regra do `PLACEHOLDER_SOURCE` do pacote.
 */
const NAME = /^[^{}\s/]{1,128}$/

/** O mínimo para uma senha nova. A força vem do scrypt + `.env`; isto só evita o acidente. */
const MIN_PASSWORD = 8

const text = (body: unknown, field: string): string | undefined => {
  const value = (body as Record<string, unknown> | null | undefined)?.[field]
  return typeof value === 'string' ? value : undefined
}

/**
 * As rotas do cofre (ADR 0013).
 *
 * Toda resposta sai com `Cache-Control: no-store`: a de revelar carrega um
 * segredo, e as outras dizem se o cofre está aberto. A defesa de Host e Origin
 * do shell (ADR 0012) já vale para elas, como para toda rota.
 *
 * Cada erro do cofre vira um status que diz onde procurar, como as rotas do
 * Requests fazem: `423` é "abra o cofre", `412` é "falta o `.env`", `401` é
 * "a senha não abriu".
 */
export function registerVaultRoutes(app: FastifyInstance, vault: Vault): void {
  app.addHook('onSend', async (request, reply) => {
    const url = request.routeOptions.url ?? ''
    if (url.startsWith('/vault') || url.startsWith('/secrets')) reply.header('cache-control', 'no-store')
  })

  const answer = async (reply: FastifyReply, work: () => unknown, okCode = 204) => {
    try {
      const result = work()
      return result === undefined ? reply.code(okCode).send() : reply.code(okCode).send(result)
    } catch (error) {
      if (error instanceof VaultLockedError) return reply.code(423).send({ error: error.message })
      if (error instanceof MissingSecretKeyError) return reply.code(412).send({ error: error.message })
      if (error instanceof WrongPasswordError) return reply.code(401).send({ error: error.message })
      if (error instanceof VaultExistsError) return reply.code(409).send({ error: error.message })
      if (error instanceof VaultNotCreatedError || error instanceof SecretNotFoundError) {
        return reply.code(404).send({ error: error.message })
      }
      // 422 e não 500: o banco foi alterado por fora, e a recusa diz qual linha.
      if (error instanceof CorruptSecretError) return reply.code(422).send({ error: error.message })
      throw error
    }
  }

  const newPassword = (body: unknown, reply: FastifyReply) => {
    const password = text(body, 'password')
    if (password === undefined || password.length < MIN_PASSWORD) {
      void reply.code(400).send({ error: `a senha precisa ter pelo menos ${MIN_PASSWORD} caracteres` })
      return undefined
    }
    return password
  }

  app.get('/vault', async () => vault.status())

  app.post('/vault', async (request, reply) => {
    const password = newPassword(request.body, reply)
    if (password === undefined) return reply
    return answer(reply, () => vault.create(password), 201)
  })

  app.post('/vault/unlock', async (request, reply) => {
    const recoveryKey = text(request.body, 'recoveryKey')
    if (recoveryKey !== undefined) return answer(reply, () => vault.unlockWithRecovery(recoveryKey))
    const password = text(request.body, 'password')
    if (password === undefined) {
      return reply.code(400).send({ error: 'mande a senha (`password`) ou a chave de recuperação (`recoveryKey`)' })
    }
    return answer(reply, () => vault.unlock(password))
  })

  app.post('/vault/lock', async (_request, reply) => answer(reply, () => vault.lock()))

  app.put('/vault/password', async (request, reply) => {
    const password = newPassword(request.body, reply)
    if (password === undefined) return reply
    return answer(reply, () => vault.setPassword(password))
  })

  app.get('/secrets', async () => vault.list())

  app.get('/secrets/:environment/:name', async (request, reply) => {
    const { environment, name } = request.params as { environment: string; name: string }
    return answer(reply, () => ({ value: vault.get(environment, name) }), 200)
  })

  app.put('/secrets/:environment/:name', async (request, reply) => {
    const { environment, name } = request.params as { environment: string; name: string }
    if (!ENVIRONMENT.test(environment)) {
      return reply.code(400).send({ error: 'o ambiente aceita letras, números, `_`, `.` e `-`' })
    }
    if (!NAME.test(name)) {
      return reply.code(400).send({ error: 'o nome tem que poder ser usado como {{nome}}: sem espaço, sem chaves' })
    }
    const value = text(request.body, 'value')
    if (value === undefined) return reply.code(400).send({ error: '`value` deve ser texto' })
    return answer(reply, () => vault.set(environment, name, value))
  })

  app.delete('/secrets/:environment/:name', async (request, reply) => {
    const { environment, name } = request.params as { environment: string; name: string }
    return answer(reply, () => vault.delete(environment, name))
  })
}
