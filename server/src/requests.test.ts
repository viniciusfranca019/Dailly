import { inMemoryEntryRepository } from '@dailly/domain'
import { UTC } from '@dailly/periods'
import type { SavedRequest } from '@dailly/requests-core'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './shell/app.js'
import { openDatabase } from './shell/database.js'

/**
 * O módulo Requests de ponta a ponta: salvar pela API, executar contra um alvo
 * HTTP **de verdade**, num socket.
 *
 * Ele mora na raiz de `src/` e não dentro do módulo porque monta o app inteiro
 * — é teste de composição, e a fronteira recusa (com razão) um arquivo de
 * módulo alcançando o `shell/`.
 *
 * O alvo é um Fastify de verdade numa porta efêmera. Um alvo falso provaria o
 * chamador; o que estes cenários precisam provar é o que acontece na rede —
 * header que chega, status que volta, corpo que passa pelo fio.
 */
let target: FastifyInstance
let targetUrl: string
/** Quantas vezes o alvo foi tocado — é como o C3 prova que nada saiu. */
let hits: number

beforeEach(async () => {
  hits = 0
  target = Fastify({ logger: false })
  target.addHook('onRequest', async () => {
    hits += 1
  })
  target.all('/eco', async (request, reply) => {
    reply.header('x-eco', 'sim')
    return { metodo: request.method, headers: request.headers, corpo: request.body ?? null }
  })
  target.get('/grande', async (_request, reply) => {
    reply.type('text/plain')
    return 'x'.repeat(6 * 1024 * 1024)
  })
  target.get('/binario', async (_request, reply) => {
    reply.type('image/png')
    return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  })
  target.get('/redireciona', async (_request, reply) => reply.code(302).header('location', '/eco').send())
  await target.listen({ host: '127.0.0.1', port: 0 })
  const address = target.server.address()
  targetUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
})

afterEach(async () => {
  await target.close()
})

const spec = (over: Record<string, unknown> = {}) => ({
  method: 'GET',
  url: `${targetUrl}/eco`,
  headers: [] as { name: string; value: string }[],
  body: null as string | null,
  query: [] as string[],
  auth: null,
  ...over,
})

const saved = (over: Partial<SavedRequest> = {}): SavedRequest => ({
  id: 'r-1',
  name: 'eco',
  protocol: 'http',
  spec: spec(),
  folderId: null,
  position: 0,
  ...over,
})

/**
 * O app de verdade, com o manifesto de verdade e um SQLite em memória.
 *
 * Nada de fake aqui: a request é salva pela rota, guardada pelo adapter real e
 * lida de volta na hora de executar. É o caminho que o app faz.
 */
const appWith = (token?: string) =>
  buildApp({
    entries: inMemoryEntryRepository(),
    zone: UTC,
    db: openDatabase(':memory:'),
    ...(token ? { token } : {}),
  })

const seed = async (app: FastifyInstance, request: SavedRequest, token?: string) => {
  const response = await app.inject({
    method: 'POST',
    url: '/requests',
    payload: request as unknown as Record<string, unknown>,
    ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
  })
  expect(response.statusCode).toBe(201)
}

const execute = async (app: FastifyInstance, body: Record<string, unknown> = {}, id = 'r-1') =>
  await app.inject({ method: 'POST', url: `/requests/${id}/execute`, payload: body })

describe('C2: executar devolve status, headers, corpo e o tempo que levou', () => {
  it('leva a requisição até o alvo e traz a resposta inteira', async () => {
    const app = appWith()
    await seed(app, saved())

    const response = await execute(app)
    const body = response.json()

    expect(response.statusCode).toBe(200)
    expect(body.status).toBe(200)
    expect(body.headers).toContainEqual({ name: 'x-eco', value: 'sim' })
    expect(JSON.parse(body.body).metodo).toBe('GET')
    expect(body.durationMs).toBeGreaterThanOrEqual(0)
    expect(body.encoding).toBe('utf-8')
    expect(body.truncated).toBe(false)
  })

  it('manda header e corpo que o browser não deixaria mandar', async () => {
    // É a razão da ADR 0011 inteira: `Cookie` e `Referer` são proibidos num
    // renderer, e sem eles não se testa autenticação.
    const app = appWith()
    await seed(app, 
      saved({
        spec: spec({
          method: 'POST',
          headers: [
            { name: 'Cookie', value: 'sid=1' },
            { name: 'Referer', value: 'https://ref.dev' },
            // Sem isto o alvo recusa o corpo com 415, e o teste falharia por
            // uma razão que não é a dele.
            { name: 'content-type', value: 'application/json' },
          ],
          body: '{"a":1}',
        }),
      }),
    )

    const eco = JSON.parse((await execute(app)).json().body)

    expect(eco.metodo).toBe('POST')
    expect(eco.headers.cookie).toBe('sid=1')
    expect(eco.headers.referer).toBe('https://ref.dev')
  })

  it('mostra o redirect em vez de segui-lo', async () => {
    // Um cliente de API existe para mostrar o 302 e o Location.
    const app = appWith()
    await seed(app, saved({ spec: spec({ url: `${targetUrl}/redireciona` }) }))

    const body = (await execute(app)).json()

    expect(body.status).toBe(302)
    expect(body.headers).toContainEqual({ name: 'location', value: '/eco' })
  })

  it('devolve 502 quando o alvo não responde, e não 500', async () => {
    // Quem falhou foi o alvo. Dizer 500 seria assumir a culpa de outro
    // processo e mandar a pessoa depurar o lugar errado.
    const app = appWith()
    await seed(app, saved({ spec: spec({ url: 'http://127.0.0.1:1/nada' }) }))

    const response = await execute(app)

    expect(response.statusCode).toBe(502)
    expect(response.json().error).toMatch(/não consegui alcançar/)
  })

  it('404 quando a request não existe, em vez de executar nada', async () => {
    expect((await execute(appWith(), {}, 'fantasma')).statusCode).toBe(404)
  })
})

describe('C3: variável sem valor recusa antes de qualquer byte sair', () => {
  it('recusa nomeando a variável, e nada chega ao alvo', async () => {
    // O contador do alvo é a prova que interessa: a recusa acontece *antes* da
    // rede, não é um erro que volta depois de a requisição ter saído.
    const app = appWith()
    await seed(app, saved({ spec: spec({ url: `${targetUrl}/eco?t={{token}}` }) }))
    const before = hits

    const response = await execute(app, { env: {} })

    expect(response.statusCode).toBe(400)
    expect(response.json().missing).toEqual(['token'])
    expect(hits).toBe(before)
  })

  it('executa quando o ambiente traz a variável', async () => {
    const app = appWith()
    await seed(app, saved({ spec: spec({ url: `${targetUrl}/eco?t={{token}}` }) }))

    expect((await execute(app, { env: { token: 'abc' } })).statusCode).toBe(200)
  })

  it('recusa um env que não é objeto, em vez de tratá-lo como vazio', async () => {
    const app = appWith()
    await seed(app, saved())

    expect((await execute(app, { env: 'texto' })).statusCode).toBe(400)
  })
})

describe('C4: um spec que não casa com o schema é recusado nomeando o campo', () => {
  it('devolve 422 com os campos, porque o banco é fronteira de confiança', async () => {
    // O JSON vem do SQLite. Um registro escrito à mão, ou por uma versão
    // anterior, não é confiável só por estar no disco.
    const app = appWith()
    await seed(app, saved({ spec: { method: '', url: '', headers: 'não é lista' } }))

    const response = await execute(app)

    expect(response.statusCode).toBe(422)
    expect(response.json().errors.map((e: { field: string }) => e.field).sort()).toContain('url')
  })

  it('devolve 422 para um protocolo que este servidor não conhece', async () => {
    const app = appWith()
    await seed(app, saved({ protocol: 'carrier-pigeon' }))

    const response = await execute(app)

    expect(response.statusCode).toBe(422)
    expect(response.json().error).toMatch(/carrier-pigeon/)
  })
})

describe('C5: a rota de execução passa pelo token como todas as outras', () => {
  it('recusa sem token — a isenção do /health não a alcança', async () => {
    // A rota é egresso arbitrário para a internet a partir desta máquina. É a
    // rota mais sensível da API, não a menos.
    const app = appWith('segredo')
    await seed(app, saved(), 'segredo')

    const response = await app.inject({ method: 'POST', url: '/requests/r-1/execute', payload: {} })

    expect(response.statusCode).toBe(401)
  })

  it('aceita com o token certo', async () => {
    const app = appWith('segredo')
    await seed(app, saved(), 'segredo')

    const response = await app.inject({
      method: 'POST',
      url: '/requests/r-1/execute',
      payload: {},
      headers: { authorization: 'Bearer segredo' },
    })

    expect(response.statusCode).toBe(200)
  })

  it('as rotas de coleção também passam pelo token', async () => {
    const app = appWith('segredo')

    expect((await app.inject({ method: 'GET', url: '/requests' })).statusCode).toBe(401)
  })
})

describe('C7: resposta grande ou binária chega com aviso', () => {
  it('trunca no teto e marca, em vez de entregar 6 MB calado', async () => {
    const app = appWith()
    await seed(app, saved({ spec: spec({ url: `${targetUrl}/grande` }) }))

    const body = (await execute(app)).json()

    expect(body.truncated).toBe(true)
    expect(body.body.length).toBe(5 * 1024 * 1024)
    // `bytes` conta o que o alvo mandou, não o que sobrou: é o número que diz
    // quanto se perdeu.
    expect(body.bytes).toBe(6 * 1024 * 1024)
  })

  it('codifica o que não é texto, com a marca dizendo que codificou', async () => {
    // Enfiar bytes de PNG num utf-8 produz corpo corrompido sem erro nenhum.
    const app = appWith()
    await seed(app, saved({ spec: spec({ url: `${targetUrl}/binario` }) }))

    const body = (await execute(app)).json()

    expect(body.encoding).toBe('base64')
    expect(Buffer.from(body.body, 'base64').subarray(0, 4)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    )
  })

  it('resposta normal não vem marcada', async () => {
    const app = appWith()
    await seed(app, saved())
    const body = (await execute(app)).json()

    expect(body.truncated).toBe(false)
    expect(body.encoding).toBe('utf-8')
  })
})
