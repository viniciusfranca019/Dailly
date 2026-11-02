import { describe, expect, it } from 'vitest'
import { fromPostman, NotAPostmanCollectionError } from './postman.js'

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
