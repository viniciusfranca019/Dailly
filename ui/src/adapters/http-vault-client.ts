import { VaultRefusedError, type VaultPort, type VaultRefusal, type VaultState } from '@shared'
import type { ApiConfig } from './api.js'
import { ApiError } from './errors.js'
import { httpClient } from './http.js'

/**
 * O cofre sobre `/vault` e `/secrets` (ADR 0013).
 *
 * Cada status de recusa do servidor vira um motivo que a tela entende. A
 * mensagem é a do servidor, que diz o resto (qual variável falta no `.env`,
 * por que a senha não abriu).
 */
const REFUSALS: Readonly<Record<number, VaultRefusal | undefined>> = {
  423: 'locked',
  401: 'wrong-password',
  412: 'missing-key',
  409: 'exists',
  400: 'invalid',
}

const STATES: readonly VaultState[] = ['sem-chave', 'nao-criado', 'trancado', 'aberto']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const httpVaultClient = (deps: { config: ApiConfig; fetch?: typeof globalThis.fetch }): VaultPort => {
  const send = httpClient(deps)
  const path = (environment: string, name: string) =>
    `/secrets/${encodeURIComponent(environment)}/${encodeURIComponent(name)}`

  const call = async (url: string, init?: RequestInit): Promise<unknown> => {
    try {
      return await send(url, init)
    } catch (error) {
      const kind = error instanceof ApiError ? REFUSALS[error.status] : undefined
      if (error instanceof ApiError && kind !== undefined) throw new VaultRefusedError(kind, error.message)
      throw error
    }
  }

  const post = (url: string, body?: object) =>
    call(url, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) })

  return {
    async status() {
      const payload = await call('/vault')
      const state = isRecord(payload) ? payload['state'] : undefined
      return STATES.find((known) => known === state) ?? 'trancado'
    },
    async create(password) {
      const payload = await post('/vault', { password })
      if (!isRecord(payload) || typeof payload['recoveryKey'] !== 'string') {
        throw new Error('o servidor criou o cofre e não devolveu a chave de recuperação')
      }
      return payload['recoveryKey']
    },
    async unlock(password) {
      await post('/vault/unlock', { password })
    },
    async unlockWithRecovery(recoveryKey) {
      await post('/vault/unlock', { recoveryKey })
    },
    async lock() {
      await post('/vault/lock')
    },
    async list() {
      const payload = await call('/secrets')
      return (Array.isArray(payload) ? payload : [])
        .filter(isRecord)
        .filter((row) => typeof row['environment'] === 'string' && typeof row['name'] === 'string')
        .map((row) => ({ environment: row['environment'] as string, name: row['name'] as string }))
    },
    async reveal(environment, name) {
      const payload = await call(path(environment, name))
      if (!isRecord(payload) || typeof payload['value'] !== 'string') {
        throw new Error('o servidor não devolveu o valor do segredo')
      }
      return payload['value']
    },
    async save(environment, name, value) {
      await call(path(environment, name), { method: 'PUT', body: JSON.stringify({ value }) })
    },
    async remove(environment, name) {
      await call(path(environment, name), { method: 'DELETE' })
    },
  }
}
