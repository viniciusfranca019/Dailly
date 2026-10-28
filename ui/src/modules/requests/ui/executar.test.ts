// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  settle,
  mount,
  at,
  allAt,
  text,
  click,
  fill,
  request,
  executed,
  deps,
  novaRequest,
  held,
  CURL,
} from './test-harness.js'
import { ExecutionFailedError, MissingVariablesError, type ExecutedResponse, type RequestsPort } from '@shared'
import { testRequestsPort } from '@shared/testing.js'
import { createApp } from 'vue'
import ResponseView from './response/ResponseView.vue'
import { type DecodedBody } from '../model/decode.js'

describe('C7: executar e ver a resposta embaixo', () => {
  it('mostra status, tempo e corpo', async () => {
    const port = testRequestsPort({
      requests: [request('r1', 'uma')],
      execute: async () => executed(),
    })
    const { host } = mount(deps(port))
    await settle()

    await click(allAt(host, 'request')[0]!)
    await click(at(host, 'execute'))

    expect(text(host, 'response-status')).toContain('200')
    expect(text(host, 'response-time')).toContain('42')
    expect(text(host, 'response-body')).toContain('"ok":true')
    expect(text(host, 'response-headers')).toContain('content-type')
  })

  it('não dispara duas vezes enquanto uma execução está em voo', async () => {
    // Duas execuções em paralelo mostram a resposta da que terminar por último,
    // que não é necessariamente a última que a pessoa pediu — e a requisição
    // sai duas vezes, que num POST não é detalhe.
    let calls = 0
    let release = (): void => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const port = testRequestsPort({
      requests: [request('r1', 'uma')],
      execute: async () => {
        calls += 1
        await held
        return executed()
      },
    })
    const { host } = mount(deps(port))
    await settle()

    await click(allAt(host, 'request')[0]!)
    await click(at(host, 'execute'))
    expect(at(host, 'running')).not.toBeNull()

    await click(at(host, 'execute'))
    expect(calls).toBe(1)

    release()
    await settle()
    expect(at(host, 'running')).toBeNull()
  })
})

describe('C8, C9: o corpo comprimido', () => {
  const gzipped = (contentEncoding: string, body: string) =>
    executed({
      encoding: 'base64',
      body,
      headers: [{ name: 'content-encoding', value: contentEncoding }],
    })

  it('mostra o JSON descomprimido', async () => {
    const source = new ReadableStream<BufferSource>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"ok":true}'))
        controller.close()
      },
    })
    const reader = source.pipeThrough(new CompressionStream('gzip')).getReader()
    const chunks: number[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(...value)
    }

    const port = testRequestsPort({
      requests: [request('r1', 'uma')],
      execute: async () => gzipped('gzip', btoa(String.fromCharCode(...chunks))),
    })
    const { host } = mount(deps(port))
    await settle()

    await click(allAt(host, 'request')[0]!)
    await click(at(host, 'execute'))

    expect(text(host, 'response-body')).toContain('"ok":true')
    expect(at(host, 'response-opaque')).toBeNull()
  })

  it('diz que veio em brotli em vez de encher a tela de caractere inventado', async () => {
    const port = testRequestsPort({
      requests: [request('r1', 'uma')],
      execute: async () => gzipped('br', btoa('\x1b\x02\x00')),
    })
    const { host } = mount(deps(port))
    await settle()

    await click(allAt(host, 'request')[0]!)
    await click(at(host, 'execute'))

    expect(text(host, 'response-opaque')).toContain('br')
    expect(at(host, 'response-body')).toBeNull()
  })
})

describe('C10, C11: as recusas', () => {
  it('nomeia as variáveis que faltam', async () => {
    const port = testRequestsPort({
      requests: [request('r1', 'uma')],
      execute: async () => {
        throw new MissingVariablesError(['token'], ['baseUrl'], 'faltam variáveis')
      },
    })
    const { host } = mount(deps(port))
    await settle()

    await click(allAt(host, 'request')[0]!)
    await click(at(host, 'execute'))

    // Dizer "falta variável" manda caçar qual entre doze.
    expect(text(host, 'execution-error')).toContain('token')
    expect(at(host, 'execution-error')?.getAttribute('role')).toBe('alert')
  })

  it('dá uma frase diferente para cada modo de falha', async () => {
    const said: string[] = []
    for (const kind of ['offline', 'refused', 'unreachable', 'timeout'] as const) {
      const port = testRequestsPort({
        requests: [request('r1', 'uma')],
        execute: async () => {
          // A **mesma** mensagem crua nos quatro. Com uma mensagem diferente
          // por modo, este teste passaria mesmo se `describeFailure` colapsasse
          // para `return cause.message` — que é exatamente a regressão que o
          // C11 existe para impedir.
          throw new ExecutionFailedError(kind, 'cru')
        },
      })
      const { host, destroy } = mount(deps(port))
      await settle()

      await click(allAt(host, 'request')[0]!)
      await click(at(host, 'execute'))
      said.push(text(host, 'execution-error'))
      destroy()
    }

    expect(new Set(said).size).toBe(4)
    expect(said.every((phrase) => phrase !== '')).toBe(true)
  })
})

describe('BLOCKER: as duas marcas de corte são duas, e as duas aparecem', () => {
  // Testado direto no `ResponseView` e não pela tela inteira porque o defeito
  // era dele: o `truncated` do decodificador existia no dado e nenhum `.vue`
  // o lia. Chegar até aqui pela tela exigiria um corpo de 16 MB para estourar
  // o teto de verdade — um teste lento que provaria a mesma linha.
  const mountView = (decoded: DecodedBody, over: Partial<ExecutedResponse> = {}) => {
    const host = document.createElement('div')
    document.body.append(host)
    createApp(ResponseView, { response: executed(over), decoded }).mount(host)
    return host
  }

  it('marca o corte feito ao descomprimir, que o servidor não fez', async () => {
    // O servidor entregou inteiro — comprimido coube nos 5 MB dele. Quem corta
    // é esta tela, ao expandir. Sem a marca a pessoa lê um JSON que termina no
    // meio, com 200 do lado, e nada dizendo por quê.
    const host = mountView({ kind: 'text', text: 'a'.repeat(10), truncated: true, ceiling: true })
    await settle()

    expect(at(host, 'body-truncated')).not.toBeNull()
    expect(at(host, 'response-truncated')).toBeNull()
  })

  it('não repete a marca quando quem cortou foi o servidor', async () => {
    const host = mountView(
      // Cortado na rede: `ceiling` falso, porque quem cortou não foi esta tela.
      { kind: 'text', text: 'a', truncated: true, ceiling: false },
      { truncated: true, contentLength: 9000 },
    )
    await settle()

    expect(at(host, 'response-truncated')).not.toBeNull()
    expect(at(host, 'body-truncated')).toBeNull()
  })

  it('não marca nada quando nada foi cortado', async () => {
    const host = mountView({ kind: 'text', text: 'a', truncated: false, ceiling: false })
    await settle()

    expect(at(host, 'body-truncated')).toBeNull()
    expect(at(host, 'response-truncated')).toBeNull()
  })
})

describe('M2: executar roda o que está na tela, não o que ficou gravado', () => {
  /** O que o servidor teria executado: o spec que está no banco naquele instante. */
  const urlExecutada = async (port: RequestsPort, id: string) => {
    const saved = (await port.requests()).find((request) => request.id === id)
    return (saved?.spec as { url?: string } | undefined)?.url
  }

  it('grava a edição antes de rodar', async () => {
    // A rota é `POST /requests/:id/execute` (ADR 0011), então o servidor só
    // sabe rodar o que está no banco. Sem gravar antes, a tela mostrava
    // `staging` e a rede recebia o host velho — em silêncio.
    let executada: string | undefined
    const port = testRequestsPort({ requests: [request('r1', 'uma')] })
    const spy: RequestsPort = {
      ...port,
      execute: async (id) => {
        executada = await urlExecutada(port, id)
        return executed()
      },
    }
    const { host } = mount(deps(spy))
    await settle()

    await click(allAt(host, 'request')[0]!)
    await fill(at(host, 'url'), 'https://x.dev/EDITADA')
    await click(at(host, 'execute'))

    expect(executada).toBe('https://x.dev/EDITADA')
  })

  it('não executa quando a gravação falha, e diz por quê', async () => {
    // Executar sem gravar mandaria para a rede exatamente o spec velho que a
    // pessoa acabou de mudar — o defeito, com uma etapa a mais.
    let calls = 0
    const port = testRequestsPort({ requests: [request('r1', 'uma')] })
    const refusing: RequestsPort = {
      ...port,
      async saveRequest() {
        throw new Error('o servidor recusou')
      },
      execute: async () => {
        calls += 1
        return executed()
      },
    }
    const { host } = mount(deps(refusing))
    await settle()

    await click(allAt(host, 'request')[0]!)
    await fill(at(host, 'url'), 'https://x.dev/EDITADA')
    await click(at(host, 'execute'))

    expect(calls).toBe(0)
    expect(text(host, 'error')).toContain('o servidor recusou')
    expect(at(host, 'response')).toBeNull()
  })

  it('um curl recém-colado roda sem passar pelo botão Salvar', async () => {
    // No Insomnia não existe "ainda não salvo", então também não existe request
    // que não dá para rodar. Aqui a gravação é a mesma que o Executar já faz.
    const port = testRequestsPort()
    const spy: RequestsPort = { ...port, execute: async () => executed() }
    const { host } = mount(deps(spy))
    await settle()

    await novaRequest(host)
    await fill(at(host, 'url'), CURL)
    await click(at(host, 'execute'))

    expect(text(host, 'response-status')).toContain('200')
    expect((await port.requests()).map((saved) => saved.name)).toEqual([
      'https://api.stripe.com/v1/charges',
    ])
  })
})
