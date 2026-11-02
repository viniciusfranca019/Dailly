import { LockedSecretsError, VaultRefusedError } from '@shared'
import { describe, expect, it } from 'vitest'
import { httpRequestsClient } from './http-requests-client.js'
import { httpVaultClient } from './http-vault-client.js'

const config = { baseUrl: '/api' }

/** Um `fetch` escrito à mão, que responde por status e corpo. */
const answering = (status: number, body?: unknown) =>
  (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected end of JSON input')
      return body
    },
  })) as unknown as typeof globalThis.fetch

describe('o adapter do cofre', () => {
  it('sem chave e com cofre criado é "só recuperação"; sem cofre é "sem chave"', async () => {
    const read = (body: object) => httpVaultClient({ config, fetch: answering(200, body) }).status()
    expect(await read({ state: 'sem-chave', missing: 'DAILLY_SECRET_KEY', created: true })).toBe('so-recuperacao')
    expect(await read({ state: 'sem-chave', missing: 'DAILLY_SECRET_KEY', created: false })).toBe('sem-chave')
  })

  it('lê o estado', async () => {
    expect(await httpVaultClient({ config, fetch: answering(200, { state: 'trancado' }) }).status()).toBe('trancado')
  })

  it('traduz cada recusa do servidor no motivo que a tela entende', async () => {
    const cases: [number, string][] = [
      [423, 'locked'],
      [401, 'wrong-password'],
      [412, 'missing-key'],
      [409, 'exists'],
      [400, 'invalid'],
    ]
    for (const [status, kind] of cases) {
      const vault = httpVaultClient({ config, fetch: answering(status, { error: `recusa ${status}` }) })
      await expect(vault.unlock('x'), String(status)).rejects.toMatchObject({ kind, message: `recusa ${status}` })
      await expect(vault.unlock('x')).rejects.toBeInstanceOf(VaultRefusedError)
    }
  })

  it('devolve a chave de recuperação ao criar e o valor ao revelar', async () => {
    expect(await httpVaultClient({ config, fetch: answering(201, { recoveryKey: 'ABCD-EFGH' }) }).create('x'.repeat(8))).toBe('ABCD-EFGH')
    expect(await httpVaultClient({ config, fetch: answering(200, { value: 'sk' }) }).reveal('default', 'k')).toBe('sk')
  })
})

describe('a execução trancada', () => {
  it('o 423 do execute vira LockedSecretsError com os nomes', async () => {
    const client = httpRequestsClient({ config, fetch: answering(423, { error: 'cofre trancado', locked: ['stripe_key'] }) })
    const attempt = client.execute('r1', {})
    await expect(attempt).rejects.toBeInstanceOf(LockedSecretsError)
    await expect(attempt).rejects.toMatchObject({ names: ['stripe_key'] })
  })
})
