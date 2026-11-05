import { UTC } from '@dailly/periods'
import { randomBytes } from 'node:crypto'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './shell/app.js'
import { openDatabase } from './shell/database.js'

/**
 * C5 — a execução resolve `{{nome}}` também pelo cofre (ADR 0013).
 *
 * O alvo é um servidor de verdade que devolve os headers que recebeu: é como
 * o teste vê o que saiu para a rede, e `hits` é como ele prova que nada saiu.
 */
let target: FastifyInstance
let targetUrl: string
let hits: number

beforeEach(async () => {
  hits = 0
  target = Fastify({ logger: false })
  target.addHook('onRequest', async () => {
    hits += 1
  })
  target.get('/eco', async (request) => ({ headers: request.headers }))
  await target.listen({ host: '127.0.0.1', port: 0 })
  const address = target.server.address()
  targetUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
})

afterEach(async () => {
  await target.close()
})

const appWithVault = async (url = () => `${targetUrl}/eco`) => {
  const app = buildApp({
    zone: UTC,
    db: openDatabase(':memory:'),
    secretKey: randomBytes(32).toString('base64'),
    kdf: { N: 2 ** 10, r: 8, p: 1 },
  })
  expect((await app.inject({ method: 'POST', url: '/vault', payload: { password: 'uma senha longa' } })).statusCode).toBe(201)
  await app.inject({ method: 'PUT', url: '/secrets/default/stripe_key', payload: { value: 'sk_live_123' } })
  const seeded = await app.inject({
    method: 'POST',
    url: '/requests',
    payload: {
      id: 'r-1',
      name: 'stripe',
      protocol: 'http',
      spec: {
        method: 'GET',
        url: url(),
        headers: [{ name: 'Authorization', value: 'Bearer {{stripe_key}}' }],
        body: null,
        query: [],
        auth: null,
      },
      folderId: null,
      position: 0,
    },
  })
  expect(seeded.statusCode).toBe(201)
  return app
}

const execute = (app: FastifyInstance, env: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: '/requests/r-1/execute', payload: { env } })

const authorizationSent = (response: { json(): unknown }) => {
  const { body } = response.json() as { body: string }
  return (JSON.parse(body) as { headers: Record<string, string> }).headers['authorization']
}

describe('C5: a execução usa o cofre', () => {
  it('com o cofre aberto, a request sai com o valor guardado', async () => {
    const app = await appWithVault()
    const response = await execute(app)
    expect(response.statusCode).toBe(200)
    expect(authorizationSent(response)).toBe('Bearer sk_live_123')
  })

  it('o env da tela vale primeiro', async () => {
    const app = await appWithVault()
    const response = await execute(app, { stripe_key: 'sk_test_da_tela' })
    expect(authorizationSent(response)).toBe('Bearer sk_test_da_tela')
  })

  it('com o cofre trancado, recusa com 423 dizendo o nome, e nada sai para a rede', async () => {
    const app = await appWithVault()
    await app.inject({ method: 'POST', url: '/vault/lock' })

    const response = await execute(app)

    expect(response.statusCode).toBe(423)
    expect(response.json()).toMatchObject({ locked: ['stripe_key'] })
    expect(response.json().error).toMatch(/cofre/)
    expect(hits).toBe(0)
  })

  it('trancado, mas com a variável no env da tela, executa sem precisar do cofre', async () => {
    const app = await appWithVault()
    await app.inject({ method: 'POST', url: '/vault/lock' })
    const response = await execute(app, { stripe_key: 'sk_test_da_tela' })
    expect(response.statusCode).toBe(200)
  })

  it('uma variável que nem a tela nem o cofre têm continua sendo a recusa de sempre', async () => {
    const app = await appWithVault()
    await app.inject({ method: 'DELETE', url: '/secrets/default/stripe_key' })
    const response = await execute(app)
    expect(response.statusCode).toBe(400)
    expect(response.json().missing).toEqual(['stripe_key'])
    expect(hits).toBe(0)
  })
})

describe('gate: a execução e o cofre', () => {
  it('2 (major): um alvo fora do ar não devolve o valor do cofre na mensagem', async () => {
    const app = await appWithVault(() => 'http://127.0.0.1:1/x?key={{stripe_key}}')
    const response = await execute(app)
    expect(response.statusCode).toBe(502)
    expect(response.body).not.toContain('sk_live_123')
    expect(response.body).toContain('{{stripe_key}}')
  })

  it('3 (major): uma linha do cofre alterada é 422 nomeado, não 500', async () => {
    const db = openDatabase(':memory:')
    const app = buildApp({
      zone: UTC,
      db,
      secretKey: randomBytes(32).toString('base64'),
      kdf: { N: 2 ** 10, r: 8, p: 1 },
    })
    await app.inject({ method: 'POST', url: '/vault', payload: { password: 'uma senha longa' } })
    await app.inject({ method: 'PUT', url: '/secrets/default/stripe_key', payload: { value: 'sk_live_123' } })
    await app.inject({
      method: 'POST',
      url: '/requests',
      payload: {
        id: 'r-1', name: 's', protocol: 'http', folderId: null, position: 0,
        spec: { method: 'GET', url: `${targetUrl}/eco?k={{stripe_key}}`, headers: [], body: null, query: [], auth: null },
      },
    })
    db.prepare('UPDATE secrets SET nonce = randomblob(12)').run()

    const response = await execute(app)

    expect(response.statusCode).toBe(422)
    expect(response.json().error).toMatch(/stripe_key/)
    expect(hits).toBe(0)
  })

  it('4 (major): sem DAILLY_SECRET_KEY, uma request sem segredo executa normalmente', async () => {
    const app = buildApp({ zone: UTC, db: openDatabase(':memory:') })
    await app.inject({
      method: 'POST',
      url: '/requests',
      payload: {
        id: 'r-1', name: 's', protocol: 'http', folderId: null, position: 0,
        spec: { method: 'GET', url: `${targetUrl}/eco`, headers: [], body: null, query: [], auth: null },
      },
    })
    expect((await execute(app)).statusCode).toBe(200)
  })

  it('nit: sem DAILLY_SECRET_KEY, a recusa diz o que falta em vez de pedir a senha', async () => {
    const db = openDatabase(':memory:')
    const key = randomBytes(32).toString('base64')
    const withKey = buildApp({ zone: UTC, db, secretKey: key, kdf: { N: 2 ** 10, r: 8, p: 1 } })
    await withKey.inject({ method: 'POST', url: '/vault', payload: { password: 'uma senha longa' } })
    await withKey.inject({ method: 'PUT', url: '/secrets/default/stripe_key', payload: { value: 'sk_live_123' } })
    await withKey.inject({
      method: 'POST',
      url: '/requests',
      payload: {
        id: 'r-1', name: 's', protocol: 'http', folderId: null, position: 0,
        spec: { method: 'GET', url: `${targetUrl}/eco?k={{stripe_key}}`, headers: [], body: null, query: [], auth: null },
      },
    })
    const noKey = buildApp({ zone: UTC, db })
    const response = await execute(noKey)
    expect(response.statusCode).toBe(423)
    expect(response.json().error).toMatch(/DAILLY_SECRET_KEY/)
  })
})

describe('gate 2 (major): um segredo que contém outro não vaza o sufixo', () => {
  it('troca o mais longo primeiro', async () => {
    const app = await appWithVault(() => 'http://127.0.0.1:1/x?a={{short}}&b={{long}}')
    await app.inject({ method: 'PUT', url: '/secrets/default/short', payload: { value: 'sk_live' } })
    await app.inject({ method: 'PUT', url: '/secrets/default/long', payload: { value: 'sk_live_9f8e7d' } })

    const response = await execute(app)

    expect(response.statusCode).toBe(502)
    expect(response.body).not.toContain('9f8e7d')
    expect(response.body).toContain('b={{long}}')
  })
})
