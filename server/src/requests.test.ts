import { inMemoryEntryRepository } from '@dailly/domain'
import { UTC } from '@dailly/periods'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SavedRequest } from '@dailly/requests-core'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer } from './index.js'
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
  target.get('/exato', async (_request, reply) => {
    reply.type('text/plain')
    return 'x'.repeat(5 * 1024 * 1024)
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

  it('422 quando a requisição montada é inválida, e não 502', async () => {
    // O undici recusa argumento **antes** de abrir socket: método inválido,
    // URL que não é http(s). Chamar isso de "não consegui alcançar" manda a
    // pessoa investigar a rede por um erro que está no spec dela.
    const app = appWith()
    await seed(app, saved({ spec: spec({ url: 'file:///etc/hostname' }) }))

    const response = await execute(app)

    expect(response.statusCode).toBe(422)
    expect(response.json().error).toMatch(/não é válida/)
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
  it('trunca no teto, marca, e para de ler', async () => {
    const app = appWith()
    await seed(app, saved({ spec: spec({ url: `${targetUrl}/grande` }) }))

    const body = (await execute(app)).json()

    expect(body.truncated).toBe(true)
    expect(body.body.length).toBe(5 * 1024 * 1024)
    // **`bytes` mudou de significado, e a mudança é o conserto.** Antes ele
    // era o total verdadeiro, e o preço era drenar o corpo inteiro só para
    // contá-lo — um alvo de 2 GB seria baixado, e um que gotejasse para sempre
    // seguraria o processo. Agora é o que chegou, porque a leitura para no
    // teto. Quem diz o tamanho que existia é o alvo, no content-length.
    expect(body.bytes).toBe(5 * 1024 * 1024)
    expect(body.contentLength).toBe(6 * 1024 * 1024)
  })

  it('não marca como truncado um corpo que termina exatamente no teto', async () => {
    // `>=` marcava aqui, e a marca do C7 existe para dizer o que aconteceu —
    // dizer que se perdeu byte quando o corpo está inteiro é a marca mentindo.
    const app = appWith()
    await seed(app, saved({ spec: spec({ url: `${targetUrl}/exato` }) }))

    const body = (await execute(app)).json()

    expect(body.truncated).toBe(false)
    expect(body.body.length).toBe(5 * 1024 * 1024)
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

describe('C6: as pastas pela API, que era código que nenhum teste alcançava', () => {
  const folder = (over: Record<string, unknown> = {}) => ({
    id: 'raiz',
    parentId: null,
    name: 'APIs',
    position: 0,
    ...over,
  })

  const post = (app: FastifyInstance, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/requests/folders', payload })

  const move = (app: FastifyInstance, id: string, parentId: string | null) =>
    app.inject({ method: 'PATCH', url: `/requests/folders/${id}`, payload: { parentId } })

  it('cria e lista', async () => {
    const app = appWith()
    expect((await post(app, folder())).statusCode).toBe(201)

    expect((await app.inject({ method: 'GET', url: '/requests/folders' })).json()).toEqual([
      folder(),
    ])
  })

  it('recusa o laço que chega por salvar, com 409', async () => {
    // O blocker: salvar é upsert e reparenta. Duas pastas, nenhuma com raiz,
    // e as requests dentro delas sumiriam da listagem junto.
    const app = appWith()
    await post(app, folder())
    await post(app, folder({ id: 'filha', parentId: 'raiz', name: 'Auth' }))

    const response = await post(app, folder({ parentId: 'filha' }))

    expect(response.statusCode).toBe(409)
    expect((await app.inject({ method: 'GET', url: '/requests/folders' })).json()).toContainEqual(
      folder(),
    )
  })

  it('recusa o laço que chega por mover, com 409', async () => {
    const app = appWith()
    await post(app, folder())
    await post(app, folder({ id: 'filha', parentId: 'raiz', name: 'Auth' }))

    expect((await move(app, 'raiz', 'filha')).statusCode).toBe(409)
  })

  it('aceita o movimento legítimo, com 204', async () => {
    const app = appWith()
    await post(app, folder())
    await post(app, folder({ id: 'outra', parentId: null, name: 'Interno', position: 1 }))

    expect((await move(app, 'outra', 'raiz')).statusCode).toBe(204)
  })

  it('404 ao mover uma pasta que não existe, em vez de 204', async () => {
    const app = appWith()
    await post(app, folder())

    expect((await move(app, 'fantasma', 'raiz')).statusCode).toBe(404)
  })

  it('404 ao criar dentro de uma pasta que não existe', async () => {
    expect((await post(appWith(), folder({ parentId: 'fantasma' }))).statusCode).toBe(404)
  })

  it('400 quando o corpo não descreve uma pasta, nomeando os campos', async () => {
    const response = await post(appWith(), { id: '', name: '  ', parentId: 7, position: 'zero' })

    expect(response.statusCode).toBe(400)
    expect(response.json().errors.map((e: { field: string }) => e.field).sort()).toEqual([
      'id',
      'name',
      'parentId',
      'position',
    ])
  })

  it('400 quando o corpo da request salva não descreve uma request', async () => {
    const response = await appWith().inject({
      method: 'POST',
      url: '/requests',
      payload: { id: 'x' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().errors.map((e: { field: string }) => e.field)).toContain('protocol')
  })

  it('apagar a request tira da listagem', async () => {
    const app = appWith()
    await seed(app, saved())

    expect((await app.inject({ method: 'DELETE', url: '/requests/r-1' })).statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url: '/requests' })).json()).toEqual([])
  })
})

describe('C4: um spec que nem é JSON não derruba a coleção', () => {
  const corrupt = (app: FastifyInstance, db: ReturnType<typeof openDatabase>) => {
    db.prepare(
      `INSERT INTO requests (id, folder_id, name, protocol, spec, position)
       VALUES ('quebrada', NULL, 'escrita à mão', 'http', 'nao é json', 0)`,
    ).run()
    void app
  }

  it('a listagem continua de pé, com o spec nulo, para poder ser apagada', async () => {
    // Era o pior dos dois: uma linha corrompida derrubava o `GET /requests`
    // inteiro, então a interface não conseguia nem mostrar o que apagar.
    const db = openDatabase(':memory:')
    const app = buildApp({ entries: inMemoryEntryRepository(), zone: UTC, db })
    corrupt(app, db)

    const response = await app.inject({ method: 'GET', url: '/requests' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([
      expect.objectContaining({ id: 'quebrada', spec: null, name: 'escrita à mão' }),
    ])
  })

  it('executar essa request é 422 nomeando-a, e não 500', async () => {
    const db = openDatabase(':memory:')
    const app = buildApp({ entries: inMemoryEntryRepository(), zone: UTC, db })
    corrupt(app, db)

    const response = await execute(app, {}, 'quebrada')

    expect(response.statusCode).toBe(422)
    expect(response.json().error).toMatch(/quebrada/)
  })
})

describe('C3: um env malformado é recusado, não coagido para a fita', () => {
  it('recusa valor que não é texto, nomeando a variável', async () => {
    // `String.replaceAll` serializa o que receber: um objeto viraria
    // `[object Object]` na URL, um null viraria "null" — uma requisição que
    // ninguém escreveu, montada em silêncio.
    const app = appWith()
    await seed(app, saved({ spec: spec({ url: `${targetUrl}/eco?q={{v}}` }) }))
    const before = hits

    const response = await execute(app, { env: { v: { nao: 'texto' } } })

    expect(response.statusCode).toBe(400)
    expect(response.json().errors).toEqual([{ field: 'env.v', message: 'deve ser texto' }])
    expect(hits).toBe(before)
  })

  it('recusa null pelo mesmo motivo — ele viraria a palavra "null"', async () => {
    const app = appWith()
    await seed(app, saved({ spec: spec({ url: `${targetUrl}/eco?q={{v}}` }) }))

    expect((await execute(app, { env: { v: null } })).statusCode).toBe(400)
  })
})

describe('C1: a request sobrevive a reiniciar o processo', () => {
  it('volta igual de um arquivo, depois de o servidor fechar e abrir de novo', async () => {
    // A metade do C1 que eu tinha prometido e nunca provado: todo teste até
    // aqui usava `:memory:`, que morre com o processo. Um arquivo é a única
    // forma de provar a palavra "sobrevive".
    const dir = await mkdtemp(join(tmpdir(), 'dailly-req-'))
    const databaseFile = join(dir, 'dailly.sqlite')

    try {
      const primeiro = await createServer({ databaseFile })
      const criada = await fetch(`${primeiro.url}/requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(saved({ spec: spec({ url: 'https://api.exemplo.com/x' }) })),
      })
      expect(criada.status).toBe(201)
      await primeiro.close()

      // Processo novo, mesmo arquivo.
      const segundo = await createServer({ databaseFile })
      const listadas = await (await fetch(`${segundo.url}/requests`)).json()
      await segundo.close()

      expect(listadas).toEqual([
        expect.objectContaining({
          id: 'r-1',
          name: 'eco',
          protocol: 'http',
          spec: expect.objectContaining({ url: 'https://api.exemplo.com/x' }),
        }),
      ])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('C2: header repetido chega inteiro na fita', () => {
  it('manda os dois, em vez de colapsar no último', async () => {
    // O schema carrega lista de pares justamente porque `-H` repetido é
    // legítimo, e o formato sobrevivia ao parser, ao resolve e ao wire — para
    // morrer na última linha antes da rede, num `Object.fromEntries`.
    //
    // Pior que perder um header: o `resolve()` é a função pura que o renderer
    // roda para mostrar exatamente o que vai ser enviado — o argumento inteiro
    // da ADR 0011 contra o híbrido. O preview mostrava dois; a fita levava um.
    const app = appWith()
    await seed(
      app,
      saved({
        spec: spec({
          headers: [
            { name: 'x-dup', value: 'a' },
            { name: 'x-dup', value: 'b' },
          ],
        }),
      }),
    )

    const eco = JSON.parse((await execute(app)).json().body)

    // O Node junta header repetido não-cookie com `, ` do lado de quem recebe.
    expect(eco.headers['x-dup']).toBe('a, b')
  })
})

describe('C2: falhar no meio do corpo também é falha do alvo', () => {
  it('devolve 502 quando o socket morre durante a leitura, e não 500', async () => {
    // O `try` cobria só o aperto de mão. Um socket que morre durante o corpo
    // escapava inteiro e virava 500 com a mensagem crua do undici — a resposta
    // dizendo que a culpa era deste servidor.
    const { createServer: createRaw } = await import('node:http')
    const mentiroso = createRaw((_req, res) => {
      res.writeHead(200, { 'content-length': '100', 'content-type': 'text/plain' })
      res.write('dez bytes.')
      res.socket?.destroy()
    })
    await new Promise<void>((done) => mentiroso.listen(0, '127.0.0.1', done))
    const porta = (mentiroso.address() as { port: number }).port

    try {
      const app = appWith()
      await seed(app, saved({ spec: spec({ url: `http://127.0.0.1:${porta}/x` }) }))

      const response = await execute(app)

      expect(response.statusCode).toBe(502)
      expect(response.json().error).toMatch(/não consegui alcançar/)
    } finally {
      mentiroso.close()
    }
  })
})
