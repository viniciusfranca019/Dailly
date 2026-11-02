import { describe, expect, it } from 'vitest'
import { fromPostman, NotAPostmanCollectionError } from './from-postman.js'
import type { HttpSpec } from './spec.js'

/** Ids previsíveis: `id-1`, `id-2`, … na ordem em que o conversor os pede. */
const sequential = () => {
  let n = 0
  return () => `id-${++n}`
}

const request = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  request: { method: 'GET', header: [], url: { raw: '{{baseUrl}}/x' }, ...over },
})

const collection = (item: unknown[], extra: Record<string, unknown> = {}) => ({
  info: { name: 'Minha API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item,
  ...extra,
})

describe('I1: pastas fundas', () => {
  it('mantém a hierarquia e a ordem, debaixo de uma pasta raiz', () => {
    const result = fromPostman(
      collection([
        { name: 'Stripe', item: [{ name: 'Cobranças', item: [request('criar'), request('listar')] }] },
        request('health'),
      ]),
      { root: 'Apidog', nextId: sequential() },
    )

    const byName = new Map(result.folders.map((folder) => [folder.name, folder]))
    const root = byName.get('Apidog')!
    expect(root.parentId).toBeNull()
    expect(byName.get('Stripe')).toMatchObject({ parentId: root.id, position: 0 })
    expect(byName.get('Cobranças')).toMatchObject({ parentId: byName.get('Stripe')!.id, position: 0 })

    const requests = new Map(result.requests.map((r) => [r.name, r]))
    expect(requests.get('criar')).toMatchObject({ folderId: byName.get('Cobranças')!.id, position: 0 })
    expect(requests.get('listar')).toMatchObject({ folderId: byName.get('Cobranças')!.id, position: 1 })
    expect(requests.get('health')).toMatchObject({ folderId: root.id, position: 1 })
  })

  it('devolve as pastas com o pai sempre antes do filho, que é a ordem de gravar', () => {
    const result = fromPostman(
      collection([{ name: 'a', item: [{ name: 'b', item: [{ name: 'c', item: [] }] }] }]),
      { root: 'Apidog', nextId: sequential() },
    )
    const seen = new Set<string | null>([null])
    for (const folder of result.folders) {
      expect(seen.has(folder.parentId), folder.name).toBe(true)
      seen.add(folder.id)
    }
  })
})

describe('I2: a request completa', () => {
  it('converte método, URL com variável, headers ativos, body raw e Basic auth', () => {
    const result = fromPostman(
      collection([
        request('criar', {
          method: 'post',
          url: { raw: '{{baseUrl}}/v1/charges?expand=x' },
          header: [
            { key: 'Content-Type', value: 'application/json' },
            { key: 'X-Debug', value: '1', disabled: true },
          ],
          body: { mode: 'raw', raw: '{"amount":100}' },
          auth: { type: 'basic', basic: [{ key: 'username', value: '{{user}}' }, { key: 'password', value: '{{pass}}' }] },
        }),
      ]),
      { root: 'Apidog', nextId: sequential() },
    )

    expect(result.requests[0]).toMatchObject({
      name: 'criar',
      protocol: 'http',
      spec: {
        method: 'POST',
        url: '{{baseUrl}}/v1/charges?expand=x',
        headers: [{ name: 'Content-Type', value: 'application/json' }],
        body: '{"amount":100}',
        query: [],
        auth: { user: '{{user}}', password: '{{pass}}' },
      },
    })
  })

  it('aceita a URL como texto e o body urlencoded', () => {
    const result = fromPostman(
      collection([
        request('form', {
          method: 'POST',
          url: 'https://x.dev/f',
          body: { mode: 'urlencoded', urlencoded: [{ key: 'a', value: '1' }, { key: 'b c', value: 'd&e' }] },
        }),
      ]),
      { root: 'Apidog', nextId: sequential() },
    )
    expect(result.requests[0]!.spec).toMatchObject({
      url: 'https://x.dev/f',
      body: 'a=1&b+c=d%26e',
      headers: [{ name: 'Content-Type', value: 'application/x-www-form-urlencoded' }],
    })
  })

  it('o Bearer vira header Authorization', () => {
    const result = fromPostman(
      collection([request('me', { auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}' }] } })]),
      { root: 'Apidog', nextId: sequential() },
    )
    expect(result.requests[0]!.spec).toMatchObject({
      headers: [{ name: 'Authorization', value: 'Bearer {{token}}' }],
      auth: null,
    })
  })
})

describe('I3: nenhum valor de segredo', () => {
  it('os valores das variáveis da coleção não entram; o relatório lista os nomes', () => {
    const result = fromPostman(
      collection([request('a', { header: [{ key: 'X-Tenant', value: '{{tenant}}' }] })], {
        variable: [{ key: 'baseUrl', value: 'https://api.x.dev' }, { key: 'token', value: 'sk_live_segredo' }],
      }),
      { root: 'Apidog', nextId: sequential() },
    )
    expect(JSON.stringify(result)).not.toContain('sk_live_segredo')
    expect(JSON.stringify(result)).not.toContain('https://api.x.dev')
    expect(result.variables).toEqual(['baseUrl', 'tenant', 'token'])
  })

  it('uma credencial escrita direto vira variável, e o relatório diz qual', () => {
    const result = fromPostman(
      collection([
        {
          name: 'Stripe',
          item: [
            request('cobrar', {
              header: [{ key: 'X-Api-Key', value: 'sk_live_literal' }],
              auth: { type: 'bearer', bearer: [{ key: 'token', value: 'tok_literal' }] },
            }),
          ],
        },
      ]),
      { root: 'Apidog', nextId: sequential() },
    )
    expect(JSON.stringify(result.requests)).not.toContain('sk_live_literal')
    expect(JSON.stringify(result.requests)).not.toContain('tok_literal')
    expect(result.requests[0]!.spec).toMatchObject({
      headers: [
        { name: 'X-Api-Key', value: '{{stripe_cobrar_x_api_key}}' },
        { name: 'Authorization', value: 'Bearer {{stripe_cobrar_token}}' },
      ],
    })
    expect(result.literalSecrets).toEqual([
      { path: 'Stripe / cobrar', field: 'X-Api-Key', variable: 'stripe_cobrar_x_api_key' },
      { path: 'Stripe / cobrar', field: 'Bearer', variable: 'stripe_cobrar_token' },
    ])
  })
})

describe('I5: o que não converte é dito', () => {
  it('pula form-data, GraphQL e WebSocket, e lista cada um pelo caminho', () => {
    const result = fromPostman(
      collection([
        {
          name: 'Upload',
          item: [
            request('arquivo', { method: 'POST', body: { mode: 'formdata', formdata: [{ key: 'f', type: 'file', src: 'a.png' }] } }),
            request('gql', { method: 'POST', body: { mode: 'graphql', graphql: { query: '{ a }' } } }),
            request('ws', { url: { raw: 'wss://x.dev/socket' } }),
            request('ok'),
          ],
        },
      ]),
      { root: 'Apidog', nextId: sequential() },
    )
    expect(result.requests.map((r) => r.name)).toEqual(['ok'])
    expect(result.skipped).toEqual([
      { path: 'Upload / arquivo', reason: 'body form-data não é suportado' },
      { path: 'Upload / gql', reason: 'body GraphQL não é suportado' },
      { path: 'Upload / ws', reason: 'WebSocket não é suportado' },
    ])
  })

  it('recusa o que não é uma coleção Postman v2.x, dizendo o que esperava', () => {
    expect(() => fromPostman({ openapi: '3.0.0' }, { root: 'Apidog', nextId: sequential() })).toThrow(
      NotAPostmanCollectionError,
    )
  })
})

describe('gate 1: auth herdado, placeholder único, nomes sem colisão', () => {
  it('(major) uma request sem auth herda o da pasta mais próxima, e a pasta o da coleção', () => {
    const result = fromPostman(
      collection(
        [
          request('me'),
          {
            name: 'Admin',
            auth: { type: 'basic', basic: [{ key: 'username', value: '{{u}}' }, { key: 'password', value: '{{p}}' }] },
            item: [request('users'), request('aberta', { auth: { type: 'noauth' } }), request('herda', { auth: { type: 'inherit' } })],
          },
        ],
        { auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}' }] } },
      ),
      { root: 'Apidog', nextId: sequential() },
    )
    const byName = new Map(result.requests.map((r) => [r.name, r.spec]))
    expect(byName.get('me')).toMatchObject({ headers: [{ name: 'Authorization', value: 'Bearer {{token}}' }] })
    expect(byName.get('users')).toMatchObject({ auth: { user: '{{u}}', password: '{{p}}' } })
    expect(byName.get('herda')).toMatchObject({ auth: { user: '{{u}}', password: '{{p}}' } })
    expect(byName.get('aberta')).toMatchObject({ headers: [], auth: null })
  })

  it('(major) um `{{` que não forma variável é credencial literal, e vira variável', () => {
    const result = fromPostman(
      collection([request('a', { header: [{ key: 'X-Api-Key', value: 'k9{{x7Qz' }] })]),
      { root: 'Apidog', nextId: sequential() },
    )
    expect(JSON.stringify(result.requests)).not.toContain('k9{{x7Qz')
    expect(result.literalSecrets).toHaveLength(1)
  })

  it('(major) credenciais diferentes nunca dividem o nome; a mesma credencial reaproveita', () => {
    const result = fromPostman(
      collection([
        {
          name: 'Stripe',
          item: [
            request('cobrar', { header: [{ key: 'X-Api-Key', value: 'sk_live_A' }] }),
            request('cobrar', { header: [{ key: 'X-Api-Key', value: 'sk_live_B' }] }),
            request('cobrar', { header: [{ key: 'X-Api-Key', value: 'sk_live_A' }] }),
          ],
        },
        { name: '支付', item: [request('订单', { header: [{ key: 'X-Api-Key', value: 'outro' }] })] },
      ]),
      { root: 'Apidog', nextId: sequential() },
    )
    const keys = result.requests.map((r) => (r.spec as HttpSpec).headers[0]!.value)
    expect(keys[0]).toBe('{{stripe_cobrar_x_api_key}}')
    expect(keys[1]).toBe('{{stripe_cobrar_x_api_key_2}}')
    expect(keys[2]).toBe(keys[0])
    expect(new Set(keys).size).toBe(3)
    expect(keys[3]).toMatch(/^\{\{[a-z0-9_]+\}\}$/)
  })

  it('(nit) apikey no header e na query, e a senha Basic literal, viram variável', () => {
    const result = fromPostman(
      collection([
        request('h', { auth: { type: 'apikey', apikey: [{ key: 'key', value: 'X-Key' }, { key: 'value', value: 'lit1' }, { key: 'in', value: 'header' }] } }),
        request('q', { auth: { type: 'apikey', apikey: [{ key: 'key', value: 'api_key' }, { key: 'value', value: '{{k}}' }, { key: 'in', value: 'query' }] } }),
        request('b', { auth: { type: 'basic', basic: [{ key: 'username', value: 'eu' }, { key: 'password', value: 'lit2' }] } }),
      ]),
      { root: 'Apidog', nextId: sequential() },
    )
    const [h, q, b] = result.requests.map((r) => r.spec as HttpSpec)
    expect(h!.headers).toEqual([{ name: 'X-Key', value: '{{h_x_key}}' }])
    expect(q!.query).toEqual(['api_key={{k}}'])
    expect(b!.auth).toEqual({ user: 'eu', password: '{{b_password}}' })
    expect(JSON.stringify(result.requests)).not.toMatch(/lit1|lit2/)
  })

  it('(nit) Cookie e Proxy-Authorization literais também viram variável', () => {
    const result = fromPostman(
      collection([request('c', { header: [{ key: 'Cookie', value: 'sid=abc' }, { key: 'Proxy-Authorization', value: 'Basic xyz' }] })]),
      { root: 'Apidog', nextId: sequential() },
    )
    expect(JSON.stringify(result.requests)).not.toMatch(/sid=abc|Basic xyz/)
  })
})

describe('gate 2 (major): o nome gerado não reaproveita uma variável da coleção', () => {
  it('pula nomes declarados ou já usados', () => {
    const result = fromPostman(
      collection(
        [
          request('a', { header: [{ key: 'X-Access-Token', value: '{{login_token}}' }] }),
          request('Login', { header: [{ key: 'Token', value: 'abc123' }] }),
        ],
        { variable: [{ key: 'login_token', value: 'dev' }] },
      ),
      { root: 'Apidog', nextId: sequential() },
    )
    const login = result.requests.find((r) => r.name === 'Login')!.spec as HttpSpec
    expect(login.headers[0]!.value).toBe('{{login_token_2}}')
    expect(result.variables).toEqual(['baseUrl', 'login_token', 'login_token_2'])
  })
})
