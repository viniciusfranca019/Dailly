import { describe, expect, it } from 'vitest'
import { findCredentials, hideCredentials } from './credentials.js'
import { fromRaw } from './from-raw.js'
import type { HttpSpec } from './spec.js'

/**
 * Passo 10: colar um curl com credencial. Esta é a metade pura: achar as
 * credenciais escritas direto e trocá-las por `{{nome}}`. Quem pede a senha e
 * grava no cofre é a tela.
 */

const spec = (curl: string): HttpSpec => fromRaw(curl).spec

describe('C1: acha as credenciais de um curl', () => {
  it('acha Authorization, Cookie, Proxy-Authorization, x-api-key e headers com cara de chave', () => {
    const found = findCredentials(
      spec(
        `curl https://api.stripe.com/v1/charges -H 'Authorization: Bearer sk_live_1' -H 'Cookie: s=abc'` +
          ` -H 'Proxy-Authorization: Basic cHJveHk=' -H 'x-api-key: k1' -H 'X-Partner-Api-Key: k2'` +
          ` -H 'X-Session-Token: t1' -H 'Accept: application/json'`,
      ),
    )

    expect(found.map((credential) => credential.label)).toEqual([
      'Authorization',
      'Cookie',
      'Proxy-Authorization',
      'x-api-key',
      'X-Partner-Api-Key',
      'X-Session-Token',
    ])
  })

  it('sugere um nome do host e do header', () => {
    const [found] = findCredentials(spec(`curl https://api.stripe.com/v1 -H 'Authorization: Bearer sk_live_1'`))
    expect(found?.suggested).toBe('api_stripe_com_authorization')
  })

  it('separa o esquema do Authorization: o segredo é só o que vem depois', () => {
    const [found] = findCredentials(spec(`curl https://x.dev -H 'Authorization: Bearer sk_live_1'`))
    expect(found).toMatchObject({ scheme: 'Bearer', value: 'sk_live_1' })
  })

  it('acha o -u: a senha é o segredo, o usuário fica', () => {
    const [found] = findCredentials(spec(`curl -u ana:s3nha https://x.dev`))
    expect(found).toMatchObject({ label: '-u (senha)', value: 's3nha', suggested: 'x_dev_senha' })
  })

  it('o -u sem senha é o próprio token', () => {
    const [found] = findCredentials(spec(`curl -u tok_123 https://x.dev`))
    expect(found).toMatchObject({ label: '-u', value: 'tok_123' })
  })

  it('o que já é {{variável}} não é credencial literal', () => {
    expect(findCredentials(spec(`curl https://x.dev -H 'Authorization: Bearer {{token}}' -u '{{cred}}'`))).toEqual(
      [],
    )
  })

  it('dois valores diferentes nunca dividem um nome; o mesmo valor divide', () => {
    const found = findCredentials(
      spec(`curl https://x.dev -H 'x-api-key: a' -H 'X-API-KEY: b' -H 'x-api-key: a'`),
    )
    expect(found.map((credential) => credential.suggested)).toEqual([
      'x_dev_x_api_key',
      'x_dev_x_api_key_2',
      'x_dev_x_api_key',
    ])
  })

  it('C6: um curl sem credencial não acha nada', () => {
    expect(findCredentials(spec(`curl https://x.dev -H 'Accept: application/json'`))).toEqual([])
  })
})

describe('C3: troca cada credencial por {{nome}}, mantendo o esquema', () => {
  it('Authorization vira Bearer {{nome}}, x-api-key vira {{nome}}, a senha do -u vira {{nome}}', () => {
    const original = spec(
      `curl -u ana:s3nha https://x.dev -H 'Authorization: Bearer sk_live_1' -H 'x-api-key: k1' -H 'Accept: a/b'`,
    )
    const found = findCredentials(original)
    const hidden = hideCredentials(
      original,
      found.map((credential, index) => ({ id: credential.id, name: `n${index}` })),
    )

    expect(hidden.headers).toEqual([
      { name: 'Authorization', value: 'Bearer {{n0}}' },
      { name: 'x-api-key', value: '{{n1}}' },
      { name: 'Accept', value: 'a/b' },
    ])
    expect(hidden.auth).toEqual({ user: 'ana', password: '{{n2}}' })
    expect(JSON.stringify(hidden)).not.toMatch(/sk_live_1|k1"|s3nha/)
  })

  it('o -u sem senha vira {{nome}} inteiro', () => {
    const original = spec(`curl -u tok_123 https://x.dev`)
    const [found] = findCredentials(original)
    expect(hideCredentials(original, [{ id: found!.id, name: 'tok' }]).auth).toEqual({
      user: '{{tok}}',
      password: null,
    })
  })
})
