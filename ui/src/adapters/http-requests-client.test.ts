import type { Folder, SavedRequest } from '@dailly/requests-core'
import { ExecutionFailedError, MissingVariablesError } from '@shared'
import { describe, expect, it } from 'vitest'
import { ApiError } from './errors.js'
import { httpRequestsClient } from './http-requests-client.js'

interface Call {
  url: string
  init: RequestInit
}

/**
 * Um `fetch` escrito à mão, não `vi.mock`.
 *
 * O módulo não é trocado: a port recebe a função por parâmetro, que é a mesma
 * costura que o `httpEntryRepository` já usa. Mockar o módulo prenderia o teste
 * ao caminho do import em vez de ao contrato.
 */
function fakeFetch(answer: (call: Call) => { status: number; body?: unknown } | Error) {
  const calls: Call[] = []
  const doFetch = (async (input: string, init: RequestInit = {}) => {
    const call = { url: String(input), init }
    calls.push(call)
    const reply = answer(call)
    if (reply instanceof Error) throw reply
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.body,
    } as Response
  }) as unknown as typeof globalThis.fetch
  return { doFetch, calls }
}

const client = (answer: Parameters<typeof fakeFetch>[0], token?: string) => {
  const { doFetch, calls } = fakeFetch(answer)
  return {
    calls,
    port: httpRequestsClient({
      config: token === undefined ? { baseUrl: '/api' } : { baseUrl: '/api', token },
      fetch: doFetch,
    }),
  }
}

const folder: Folder = { id: 'f1', parentId: null, name: 'Stripe', position: 0 }
const saved: SavedRequest = {
  id: 'r1',
  name: 'charge',
  protocol: 'http',
  spec: { method: 'GET', url: 'https://x.dev', headers: [], body: null, query: [], auth: null },
  folderId: 'f1',
  position: 0,
}

const executed = {
  status: 200,
  headers: [{ name: 'content-type', value: 'application/json' }],
  body: '{}',
  encoding: 'utf-8',
  truncated: false,
  timedOut: false,
  bytes: 2,
  contentLength: 2,
  durationMs: 12,
}

describe('a port de Requests sobre HTTP', () => {
  it('lê pastas e requests das rotas do módulo', async () => {
    const { port, calls } = client(({ url }) =>
      url.endsWith('/requests/folders') ? { status: 200, body: [folder] } : { status: 200, body: [saved] },
    )

    expect(await port.folders()).toEqual([folder])
    expect(await port.requests()).toEqual([saved])
    expect(calls.map((call) => call.url)).toEqual(['/api/requests/folders', '/api/requests'])
  })

  it('manda o token quando o shell deu um', async () => {
    // A rota de executar é egresso arbitrário para a internet a partir desta
    // máquina, e a ADR 0011 a pôs dentro do hook do token. Um adapter que
    // esquecesse o header faria toda execução responder 401.
    const { port, calls } = client(() => ({ status: 200, body: executed }), 'segredo')
    await port.execute('r1', {})

    expect(calls[0]!.init.headers).toMatchObject({ authorization: 'Bearer segredo' })
  })

  it('C6: um ciclo de pasta recusado pelo servidor vira a mensagem do servidor', async () => {
    const { port } = client(() => ({ status: 409, body: { error: 'o resultado seria um laço' } }))

    await expect(port.saveFolder(folder)).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      message: 'o resultado seria um laço',
    })
  })

  it('C12: apagar não espera corpo nenhum', async () => {
    const { port, calls } = client(() => ({ status: 204 }))

    await expect(port.deleteRequest('r1')).resolves.toBeUndefined()
    expect(calls[0]).toMatchObject({ url: '/api/requests/r1', init: { method: 'DELETE' } })
  })

  it('C7: a resposta executada é validada na borda, não castada', async () => {
    // O gate do B2a pegou exatamente isto do outro lado: valor que atravessa
    // a fronteira e é assumido. Um `bytes: "2"` castado viraria `NaN` num
    // cálculo três telas adiante, longe da causa.
    const { port } = client(() => ({ status: 200, body: { ...executed, bytes: '2' } }))

    await expect(port.execute('r1', {})).rejects.toBeInstanceOf(ApiError)
  })

  it('C7: uma listagem que não é lista não vira tela quebrada', async () => {
    const { port } = client(() => ({ status: 200, body: { folders: [] } }))

    await expect(port.folders()).rejects.toBeInstanceOf(ApiError)
  })

  it('C7: aceita o spec nulo que o servidor manda para uma request corrompida', async () => {
    // `CorruptSpecError` existe para a request aparecer na listagem e poder ser
    // apagada. Um parse que exigisse `spec` objeto derrubaria a coleção inteira
    // de novo — o defeito que o servidor corrigiu, reintroduzido aqui.
    const { port } = client(() => ({ status: 200, body: [{ ...saved, spec: null }] }))

    expect(await port.requests()).toEqual([{ ...saved, spec: null }])
  })

  it('C10: variável faltando vira erro com os nomes, não com uma frase', async () => {
    const { port } = client(() => ({
      status: 400,
      body: { error: 'faltam variáveis', missing: ['token'], surviving: ['baseUrl'] },
    }))

    const failure = await port.execute('r1', { baseUrl: 'x' }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(MissingVariablesError)
    expect(failure).toMatchObject({ missing: ['token'], surviving: ['baseUrl'] })
  })

  it('C10: manda o env no corpo, e um objeto vazio quando não há nenhum', async () => {
    const { port, calls } = client(() => ({ status: 200, body: executed }))
    await port.execute('r1', { token: 'abc' })

    expect(calls[0]!.url).toBe('/api/requests/r1/execute')
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ env: { token: 'abc' } })
  })

  it('C11: os quatro modos de falha chegam separados na tela', async () => {
    const kinds = [
      { status: 422, kind: 'refused' },
      { status: 502, kind: 'unreachable' },
      { status: 504, kind: 'timeout' },
    ]

    for (const { status, kind } of kinds) {
      const { port } = client(() => ({ status, body: { error: 'não' } }))
      const failure = await port.execute('r1', {}).catch((error: unknown) => error)

      expect(failure, `status ${status}`).toBeInstanceOf(ExecutionFailedError)
      expect(failure).toMatchObject({ kind })
    }

    // A quarta é a API local não responder, que não tem status nenhum: o alvo
    // nem chegou a ser tentado, e dizer "o alvo não respondeu" mandaria a
    // pessoa depurar a internet quando o problema está nesta máquina.
    const { port } = client(() => new TypeError('failed to fetch'))
    const offline = await port.execute('r1', {}).catch((error: unknown) => error)

    expect(offline).toBeInstanceOf(ExecutionFailedError)
    expect(offline).toMatchObject({ kind: 'offline' })
  })

  it('C11: um 400 que não é sobre variáveis não vira MissingVariablesError', async () => {
    // O servidor devolve 400 também para env malformado. Traduzir os dois para
    // o mesmo erro faria a tela dizer "falta variável" para quem não tem
    // nenhuma — e a pessoa procuraria um problema que não existe.
    const { port } = client(() => ({
      status: 400,
      body: { errors: [{ field: 'env.v', message: 'deve ser texto' }] },
    }))

    const failure = await port.execute('r1', {}).catch((error: unknown) => error)

    expect(failure).not.toBeInstanceOf(MissingVariablesError)
    expect(failure).toBeInstanceOf(ApiError)
  })
})
