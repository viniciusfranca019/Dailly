// @vitest-environment jsdom
import type { Folder, SavedRequest } from '@dailly/requests-core'
import {
  ExecutionFailedError,
  MissingVariablesError,
  type ExecutedResponse,
  type ModuleDeps,
  type RequestsPort,
} from '@shared'
import { testModuleDeps, testRequestsPort } from '@shared/testing.js'
import { createApp } from 'vue'
import { describe, expect, it } from 'vitest'
import Requests from './Requests.vue'
import ResponseView from './ResponseView.vue'
import { MAX_DECOMPRESSED_BYTES, type DecodedBody } from './decode.js'

/** Vue renderiza na fila de microtasks; um teste tem que deixar. */
const settle = async () => {
  for (let turn = 0; turn < 4; turn++) await new Promise((resolve) => setTimeout(resolve, 0))
}

const mount = (deps: ModuleDeps) => {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(Requests, { deps })
  app.mount(host)
  return { host, destroy: () => app.unmount() }
}

const at = <T extends HTMLElement>(host: HTMLElement, id: string) =>
  host.querySelector<T>(`[data-testid="${id}"]`)
const allAt = (host: HTMLElement, id: string) =>
  [...host.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)]
const text = (host: HTMLElement, id: string) => at(host, id)?.textContent?.trim() ?? ''

const click = async (element: HTMLElement | null) => {
  element?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await settle()
}

const fill = async (element: HTMLElement | null, value: string) => {
  const field = element as HTMLInputElement | HTMLTextAreaElement | null
  if (!field) throw new Error('campo não está na tela')
  field.value = value
  field.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
}

const folder = (id: string, name: string, parentId: string | null = null): Folder => ({
  id,
  parentId,
  name,
  position: 0,
})

const request = (id: string, name: string, folderId: string | null = null): SavedRequest => ({
  id,
  name,
  protocol: 'http',
  spec: { method: 'GET', url: 'https://x.dev/a', headers: [], body: null, query: [], auth: null },
  folderId,
  position: 0,
})

const executed = (over: Partial<ExecutedResponse> = {}): ExecutedResponse => ({
  status: 200,
  headers: [{ name: 'content-type', value: 'application/json' }],
  body: '{"ok":true}',
  encoding: 'utf-8',
  truncated: false,
  timedOut: false,
  bytes: 11,
  contentLength: 11,
  durationMs: 42,
  ...over,
})

const deps = (requests: RequestsPort) => testModuleDeps({ requests })

/**
 * Espera uma condição, em vez de um número fixo de turnos.
 *
 * `settle()` basta para quase tudo, mas descomprimir 16 MB não termina em
 * quatro microtasks — e um `settle` maior seria um número mágico maior.
 */
async function until(condition: () => boolean, turns = 400): Promise<void> {
  for (let turn = 0; turn < turns; turn++) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('a condição não aconteceu a tempo')
}

/** Uma promessa que o teste solta quando quiser — para exercitar o "no meio". */
const held = () => {
  let release = (): void => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

const CURL = `curl -X POST https://api.stripe.com/v1/charges -H 'Idempotency-Key: k1' -d '{"amount":100}'`

describe('C2: a árvore de coleções, com os quatro estados', () => {
  it('mostra que está lendo antes de ter o que mostrar', async () => {
    let release = (): void => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const port = testRequestsPort()
    const slow: RequestsPort = { ...port, async folders() {
      await held
      return port.folders()
    } }

    const { host } = mount(deps(slow))
    await settle()
    expect(at(host, 'collections-loading')).not.toBeNull()

    release()
    await settle()
    expect(at(host, 'collections-loading')).toBeNull()
  })

  it('diz como começar quando não há nada', async () => {
    const { host } = mount(deps(testRequestsPort()))
    await settle()

    expect(at(host, 'collections-empty')).not.toBeNull()
    expect(at(host, 'collections-error')).toBeNull()
  })

  it('aninha as pastas e põe cada request na sua', async () => {
    const { host } = mount(
      deps(
        testRequestsPort({
          folders: [folder('f1', 'Stripe'), folder('f2', 'Charges', 'f1')],
          requests: [request('r1', 'criar cobrança', 'f2'), request('r2', 'solta')],
        }),
      ),
    )
    await settle()

    expect(allAt(host, 'folder').map((node) => node.dataset['folderId'])).toEqual(['f1', 'f2'])
    expect(allAt(host, 'request').map((node) => node.textContent?.trim())).toEqual([
      'criar cobrança',
      'solta',
    ])
  })

  it('mostra o erro e deixa tentar de novo', async () => {
    // Uma leitura remota tem quatro estados, e o quarto é o que decide se a
    // pessoa fecha o app ou clica de novo.
    let attempts = 0
    const good = testRequestsPort({ folders: [folder('f1', 'Stripe')] })
    const flaky: RequestsPort = { ...good, async folders() {
      attempts += 1
      if (attempts === 1) throw new Error('a API local não respondeu')
      return good.folders()
    } }

    const { host } = mount(deps(flaky))
    await settle()

    expect(at(host, 'collections-error')?.getAttribute('role')).toBe('alert')
    expect(text(host, 'collections-error')).toContain('a API local não respondeu')

    await click(at(host, 'collections-retry'))
    expect(at(host, 'collections-error')).toBeNull()
    expect(allAt(host, 'folder')).toHaveLength(1)
  })
})

describe('C3, C4, C5: colar um curl', () => {
  it('recria a request nos campos, sem salvar nada', async () => {
    const port = testRequestsPort()
    const { host } = mount(deps(port))
    await settle()

    await click(at(host, 'new-request'))
    await fill(at(host, 'curl'), CURL)
    await click(at(host, 'import-curl'))

    expect(at<HTMLInputElement>(host, 'method')?.value).toBe('POST')
    expect(at<HTMLInputElement>(host, 'url')?.value).toBe('https://api.stripe.com/v1/charges')
    expect(at<HTMLInputElement>(host, 'header-name')?.value).toBe('Idempotency-Key')
    expect(at<HTMLTextAreaElement>(host, 'body')?.value).toBe('{"amount":100}')
    // Importar não grava: a request só existe quando a pessoa manda salvar.
    expect(await port.requests()).toEqual([])
  })

  it('diz o que ignorou', async () => {
    const { host } = mount(deps(testRequestsPort()))
    await settle()

    await click(at(host, 'new-request'))
    await fill(at(host, 'curl'), 'curl --compressed -k https://x.dev')
    await click(at(host, 'import-curl'))

    expect(text(host, 'ignored')).toContain('-k')
  })

  it('recusa com o motivo, e não preenche campo nenhum', async () => {
    const { host } = mount(deps(testRequestsPort()))
    await settle()

    await click(at(host, 'new-request'))
    await fill(at(host, 'curl'), 'GET /v1/charges HTTP/1.1')
    await click(at(host, 'import-curl'))

    expect(at(host, 'import-error')?.getAttribute('role')).toBe('alert')
    expect(at(host, 'editor')).toBeNull()
  })
})

describe('C6: salvar', () => {
  it('põe a request na árvore, dentro da pasta escolhida', async () => {
    const port = testRequestsPort({ folders: [folder('f1', 'Stripe')] })
    const { host } = mount(deps(port))
    await settle()

    await click(at(host, 'new-request'))
    await fill(at(host, 'curl'), CURL)
    await click(at(host, 'import-curl'))
    await fill(at(host, 'name'), 'criar cobrança')

    const select = at<HTMLSelectElement>(host, 'request-folder')!
    select.value = 'f1'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await settle()

    await click(at(host, 'save'))

    const stored = await port.requests()
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ name: 'criar cobrança', folderId: 'f1' })
    expect(allAt(host, 'request').map((node) => node.textContent?.trim())).toEqual([
      'criar cobrança',
    ])
  })

  it('cria uma pasta e a mostra na árvore', async () => {
    const port = testRequestsPort()
    const { host } = mount(deps(port))
    await settle()

    await click(at(host, 'new-folder'))
    await fill(at(host, 'folder-name'), 'Stripe')
    await click(at(host, 'save-folder'))

    expect(allAt(host, 'folder').map((node) => node.textContent?.trim())).toContain('Stripe')
    expect(await port.folders()).toHaveLength(1)
  })
  // A recusa de criar pasta é exercitada em "uma pasta recusada não leva junto
  // o nome digitado", que cobre isto e mais: onde a mensagem aparece e que o
  // que foi digitado sobrevive. Este teste pedia menos do mesmo.
})

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

describe('C12: apagar', () => {
  it('tira da árvore e limpa a resposta', async () => {
    const port = testRequestsPort({
      requests: [request('r1', 'uma')],
      execute: async () => executed(),
    })
    const { host } = mount(deps(port))
    await settle()

    await click(allAt(host, 'request')[0]!)
    await click(at(host, 'execute'))
    expect(at(host, 'response')).not.toBeNull()

    await click(at(host, 'delete'))

    expect(allAt(host, 'request')).toHaveLength(0)
    // A resposta era daquela request. Deixá-la na tela faria a pessoa ler o
    // resultado de algo que não existe mais.
    expect(at(host, 'response')).toBeNull()
    expect(await port.requests()).toEqual([])
  })
})

describe('as corridas — o que chega depois de a tela ter virado', () => {
  it('BLOCKER: a resposta de uma request não cai embaixo de outra', async () => {
    const gate = held()
    const port = testRequestsPort({
      requests: [request('r1', 'uma'), { ...request('r2', 'outra'), position: 1 }],
      execute: async (id) => {
        await gate.promise
        return executed({ body: `resposta de ${id}` })
      },
    })
    const { host } = mount(deps(port))
    await settle()

    await click(allAt(host, 'request')[1]!)
    await click(at(host, 'execute'))

    // A pessoa desiste e vai olhar outra coisa no meio da execução.
    await click(allAt(host, 'request')[0]!)
    gate.release()
    await settle()

    expect(at(host, 'response')).toBeNull()
    expect(at(host, 'running')).toBeNull()
    // E o botão da request nova não pode estar travado pela execução da velha.
    expect(at<HTMLButtonElement>(host, 'execute')?.disabled).toBe(false)
  })

  it('BLOCKER: uma leitura que falha tarde não apaga a árvore que já está certa', async () => {
    const gate = held()
    let reads = 0
    const good = testRequestsPort()
    const flaky: RequestsPort = {
      ...good,
      async folders() {
        reads += 1
        if (reads === 1) {
          await gate.promise
          throw new Error('a primeira falhou tarde')
        }
        return good.folders()
      },
    }

    const { host } = mount(deps(flaky))
    await settle()

    await click(at(host, 'new-folder'))
    await fill(at(host, 'folder-name'), 'Stripe')
    await click(at(host, 'save-folder'))
    expect(allAt(host, 'folder')).toHaveLength(1)

    gate.release()
    await settle()

    // A leitura velha resolveu por último. Ela não manda: quem manda é a
    // última pedida, e a árvore na tela estava correta.
    expect(at(host, 'collections-error')).toBeNull()
    expect(allAt(host, 'folder')).toHaveLength(1)
  })
})

describe('o que o gate achou que a tela prometia e não entregava', () => {
  it('uma request com spec ilegível pode ser apagada, que é o que a tela promete', async () => {
    // A cadeia inteira existe para isto: o servidor lista `spec: null` em vez
    // de derrubar a coleção, o adapter preserva o nulo, o `draftOf` devolve
    // nulo em vez de estourar. Terminava numa tela onde ela aparece e não se
    // apaga.
    const port = testRequestsPort({ requests: [{ ...request('r1', 'quebrada'), spec: null }] })
    const { host } = mount(deps(port))
    await settle()

    await click(allAt(host, 'request')[0]!)
    expect(text(host, 'error')).toContain('apag')

    await click(at(host, 'delete'))
    expect(await port.requests()).toEqual([])
    expect(allAt(host, 'request')).toHaveLength(0)
  })

  it('uma pasta recusada não leva junto o nome digitado', async () => {
    const port = testRequestsPort()
    const refusing: RequestsPort = {
      ...port,
      async saveFolder() {
        throw new Error('o resultado seria um laço')
      },
    }
    const { host } = mount(deps(refusing))
    await settle()

    await click(at(host, 'new-folder'))
    await fill(at(host, 'folder-name'), 'Stripe')
    await click(at(host, 'save-folder'))

    // A recusa aparece **no formulário**, que é onde a pessoa está olhando —
    // e o nome continua lá para ela tentar de novo sem redigitar.
    expect(text(host, 'folder-error')).toContain('o resultado seria um laço')
    expect(at<HTMLInputElement>(host, 'folder-name')?.value).toBe('Stripe')
  })

  it('a senha nula sobrevive à tela, e só sai dela quando alguém manda', async () => {
    const port = testRequestsPort()
    const { host } = mount(deps(port))
    await settle()

    await click(at(host, 'new-request'))
    await fill(at(host, 'curl'), `curl https://x.dev -u '{{credencial}}'`)
    await click(at(host, 'import-curl'))

    // Enquanto é credencial única não há campo de senha para tropeçar: o
    // `@input` escrevia sempre texto, então um toque e um backspace trocavam
    // `null` por `''` para sempre — e a fita sai diferente.
    expect(at(host, 'auth-password')).toBeNull()
    expect(at<HTMLInputElement>(host, 'auth-user')?.value).toBe('{{credencial}}')

    await click(at(host, 'split-credential'))
    expect(at(host, 'auth-password')).not.toBeNull()
  })

  it('o botão de salvar fica de fato desabilitado enquanto salva', async () => {
    // O teste de clique duplo exercita a guarda em JS; o atributo `disabled`
    // não tinha teste nenhum, porque `MouseEvent` despachado à mão ignora
    // `disabled` no jsdom.
    const gate = held()
    const port = testRequestsPort()
    const slow: RequestsPort = {
      ...port,
      async saveRequest(saved) {
        await gate.promise
        return port.saveRequest(saved)
      },
    }
    const { host } = mount(deps(slow))
    await settle()

    await click(at(host, 'new-request'))
    await fill(at(host, 'curl'), CURL)
    await click(at(host, 'import-curl'))
    await click(at(host, 'save'))

    expect(at<HTMLButtonElement>(host, 'save')?.disabled).toBe(true)
    gate.release()
    await settle()
    expect(at<HTMLButtonElement>(host, 'save')?.disabled).toBe(false)
  })

  it('salvar sem nome mostra na tela o nome que ficou gravado', async () => {
    // `savedOf` batiza a request com a URL quando o nome está vazio. A árvore
    // passava a mostrar a URL e o campo Nome continuava vazio — dois nomes para
    // a mesma coisa, e o certo era o que a pessoa não estava vendo.
    const port = testRequestsPort()
    const { host } = mount(deps(port))
    await settle()

    await click(at(host, 'new-request'))
    await fill(at(host, 'curl'), CURL)
    await click(at(host, 'import-curl'))
    await click(at(host, 'save'))

    expect(at<HTMLInputElement>(host, 'name')?.value).toBe(
      'https://api.stripe.com/v1/charges',
    )
  })
})

describe('as linhas de header têm identidade', () => {
  it('remover a primeira não reaproveita o nó da segunda', async () => {
    const port = testRequestsPort()
    const { host } = mount(deps(port))
    await settle()

    await click(at(host, 'new-request'))
    await fill(at(host, 'curl'), `curl https://x.dev -H 'A: 1' -H 'B: 2'`)
    await click(at(host, 'import-curl'))

    const segundo = allAt(host, 'header-value')[1]!
    await click(allAt(host, 'remove-header')[0]!)

    // O nó que carregava o segundo header continua sendo o mesmo objeto DOM.
    // Com `:key` no índice o Vue destrói este e repatcha o outro — e o foco de
    // quem estava editando vai embora no meio da digitação.
    expect(allAt(host, 'header-value')[0]).toBe(segundo)
    expect(allAt(host, 'header-name').map((field) => (field as HTMLInputElement).value)).toEqual([
      'B',
    ])
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

describe('gate 2 — o que a correção do gate 1 abriu', () => {
  const two = () => [request('r1', 'uma'), { ...request('r2', 'outra'), position: 1 }]

  it('BLOCKER: salvar não arrasta a tela de volta para a request que saiu dela', async () => {
    // Mesmo mecanismo do blocker anterior por outra porta: `save()` escreve
    // `selected` e `draft` depois do await sem perguntar de quem é a tela.
    const gate = held()
    const port = testRequestsPort({ requests: two() })
    const slow: RequestsPort = {
      ...port,
      async saveRequest(saved) {
        await gate.promise
        return port.saveRequest(saved)
      },
    }
    const { host } = mount(deps(slow))
    await settle()

    await click(allAt(host, 'request')[0]!)
    await fill(at(host, 'name'), 'renomeada')
    await click(at(host, 'save'))

    await click(allAt(host, 'request')[1]!)
    gate.release()
    await settle()

    expect(at<HTMLInputElement>(host, 'name')?.value).toBe('outra')
  })

  it('BLOCKER: apagar não leva junto o editor da request que a pessoa já abriu', async () => {
    const gate = held()
    const port = testRequestsPort({ requests: two() })
    const slow: RequestsPort = {
      ...port,
      async deleteRequest(id) {
        await gate.promise
        return port.deleteRequest(id)
      },
    }
    const { host } = mount(deps(slow))
    await settle()

    await click(allAt(host, 'request')[0]!)
    await click(at(host, 'delete'))

    await click(allAt(host, 'request')[1]!)
    gate.release()
    await settle()

    expect(at(host, 'editor')).not.toBeNull()
    expect(at<HTMLInputElement>(host, 'name')?.value).toBe('outra')
  })

  it('BLOCKER: salvar não descarta o que a pessoa digitou durante a ida e volta', async () => {
    // Só o nome precisa vir do que ficou gravado. Trocar o rascunho inteiro
    // pelo que o servidor devolveu apaga a edição feita enquanto o save
    // estava em voo — e a janela é do tamanho da latência.
    const gate = held()
    const port = testRequestsPort()
    const slow: RequestsPort = {
      ...port,
      async saveRequest(saved) {
        await gate.promise
        return port.saveRequest(saved)
      },
    }
    const { host } = mount(deps(slow))
    await settle()

    await click(at(host, 'new-request'))
    await fill(at(host, 'curl'), CURL)
    await click(at(host, 'import-curl'))
    await click(at(host, 'save'))

    await fill(at(host, 'url'), 'https://api.stripe.com/v1/refunds')
    gate.release()
    await settle()

    expect(at<HTMLInputElement>(host, 'url')?.value).toBe('https://api.stripe.com/v1/refunds')
  })

  it('BLOCKER: salvar não remonta as linhas de header', async () => {
    // `draftOf` gera `rowId()` novo para cada linha, então trocar o rascunho
    // inteiro destrói e recria todos os `<input>` — o oposto do que o `rowId`
    // foi introduzido para garantir.
    const port = testRequestsPort()
    const { host } = mount(deps(port))
    await settle()

    await click(at(host, 'new-request'))
    await fill(at(host, 'curl'), CURL)
    await click(at(host, 'import-curl'))

    const linha = allAt(host, 'header-value')[0]!
    await click(at(host, 'save'))

    expect(allAt(host, 'header-value')[0]).toBe(linha)
  })

  it('reclicar a request já selecionada não fura a guarda do clique duplo', async () => {
    // `invalidate()` zera `running`, então reclicar reabilitava o botão com a
    // execução ainda em voo — e o comentário do `execute` diz por que isso não
    // pode acontecer: num POST a requisição sai duas vezes.
    const gate = held()
    let calls = 0
    const port = testRequestsPort({
      requests: [request('r1', 'uma')],
      execute: async () => {
        calls += 1
        await gate.promise
        return executed()
      },
    })
    const { host } = mount(deps(port))
    await settle()

    await click(allAt(host, 'request')[0]!)
    await click(at(host, 'execute'))
    await click(allAt(host, 'request')[0]!)

    expect(at(host, 'running')).not.toBeNull()
    await click(at(host, 'execute'))
    expect(calls).toBe(1)

    gate.release()
    await settle()
  })

  it('reclicar a request já selecionada não descarta a edição não salva', async () => {
    const port = testRequestsPort({ requests: [request('r1', 'uma')] })
    const { host } = mount(deps(port))
    await settle()

    await click(allAt(host, 'request')[0]!)
    await fill(at(host, 'url'), 'https://x.dev/editada')
    await click(allAt(host, 'request')[0]!)

    expect(at<HTMLInputElement>(host, 'url')?.value).toBe('https://x.dev/editada')
  })

  it('dois cliques em Criar não criam duas pastas', async () => {
    // Não há rota de apagar pasta neste corte, então a duplicata persistida
    // não tem como sair pela tela.
    const gate = held()
    const port = testRequestsPort()
    let calls = 0
    const slow: RequestsPort = {
      ...port,
      async saveFolder(folder) {
        calls += 1
        await gate.promise
        return port.saveFolder(folder)
      },
    }
    const { host } = mount(deps(slow))
    await settle()

    await click(at(host, 'new-folder'))
    await fill(at(host, 'folder-name'), 'Stripe')
    await click(at(host, 'save-folder'))
    expect(at<HTMLButtonElement>(host, 'save-folder')?.disabled).toBe(true)

    // A segunda tentativa vai pelo **Enter**, não por um segundo clique: um
    // botão desabilitado não recebe clique, mas Enter dentro do campo submete
    // o formulário assim mesmo. É por esse caminho que a segunda pasta nascia,
    // e é ele que a guarda do pai cobre — o `:disabled` só cobre o botão.
    at(host, 'folder-name')?.closest('form')?.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    )
    await settle()

    gate.release()
    await settle()
    expect(calls).toBe(1)
    expect(await port.folders()).toHaveLength(1)
  })

  it('C6: uma pasta nasce dentro da pasta-mãe escolhida', async () => {
    // A metade "aceita pasta-mãe" do C6 não tinha prova em lugar nenhum: o
    // `folder-parent` não aparecia em teste algum, e forçar o pai a nulo
    // deixava a suíte verde.
    const port = testRequestsPort({ folders: [folder('f1', 'Stripe')] })
    const { host } = mount(deps(port))
    await settle()

    await click(at(host, 'new-folder'))
    await fill(at(host, 'folder-name'), 'Charges')
    const parent = at<HTMLSelectElement>(host, 'folder-parent')!
    parent.value = 'f1'
    parent.dispatchEvent(new Event('change', { bubbles: true }))
    await settle()
    await click(at(host, 'save-folder'))

    expect((await port.folders()).map((f) => [f.name, f.parentId])).toEqual([
      ['Stripe', null],
      ['Charges', 'f1'],
    ])
  })

  it('C6: o formulário fecha e esquece a tentativa depois de um sucesso', async () => {
    // Três mutações sobreviviam aqui: não fechar, não limpar o nome, não
    // limpar a pasta-mãe — e a última fazia a pasta seguinte nascer num lugar
    // que ninguém pediu.
    const port = testRequestsPort({ folders: [folder('f1', 'Stripe')] })
    const { host } = mount(deps(port))
    await settle()

    await click(at(host, 'new-folder'))
    await fill(at(host, 'folder-name'), 'Charges')
    const parent = at<HTMLSelectElement>(host, 'folder-parent')!
    parent.value = 'f1'
    parent.dispatchEvent(new Event('change', { bubbles: true }))
    await settle()
    await click(at(host, 'save-folder'))

    // Fechou.
    expect(at(host, 'folder-name')).toBeNull()

    await click(at(host, 'new-folder'))
    expect(at<HTMLInputElement>(host, 'folder-name')?.value).toBe('')

    // E esqueceu a pasta-mãe: a prova é comportamental, porque um `<option>`
    // com valor nulo reflete o texto no `.value` do DOM. A pasta seguinte tem
    // que nascer na raiz, e não dentro da escolha da vez passada.
    await fill(at(host, 'folder-name'), 'Refunds')
    await click(at(host, 'save-folder'))

    expect((await port.folders()).map((f) => [f.name, f.parentId])).toEqual([
      ['Stripe', null],
      ['Charges', 'f1'],
      ['Refunds', null],
    ])
  })

  it('a recusa de ontem não acusa a tentativa de hoje', async () => {
    let refuse = true
    const port = testRequestsPort()
    const flaky: RequestsPort = {
      ...port,
      async saveFolder(folder) {
        if (refuse) throw new Error('o resultado seria um laço')
        return port.saveFolder(folder)
      },
    }
    const { host } = mount(deps(flaky))
    await settle()

    await click(at(host, 'new-folder'))
    await fill(at(host, 'folder-name'), 'Stripe')
    await click(at(host, 'save-folder'))
    expect(at(host, 'folder-error')).not.toBeNull()

    refuse = false
    await click(at(host, 'new-folder'))
    await click(at(host, 'new-folder'))

    expect(at(host, 'folder-error')).toBeNull()
  })

  it('uma releitura não branqueia a coleção que já está na tela', async () => {
    // `loading = true` em toda releitura fazia salvar, criar pasta ou apagar
    // sumirem com a árvore até a resposta voltar. Dado bom que já está na tela
    // não devia piscar.
    const gate = held()
    const port = testRequestsPort({ folders: [folder('f1', 'Stripe')] })
    let reads = 0
    const slow: RequestsPort = {
      ...port,
      async folders() {
        reads += 1
        if (reads > 1) await gate.promise
        return port.folders()
      },
    }
    const { host } = mount(deps(slow))
    await settle()
    expect(allAt(host, 'folder')).toHaveLength(1)

    await click(at(host, 'new-request'))
    await fill(at(host, 'curl'), CURL)
    await click(at(host, 'import-curl'))
    await click(at(host, 'save'))

    expect(at(host, 'collections-loading')).toBeNull()
    expect(allAt(host, 'folder')).toHaveLength(1)

    gate.release()
    await settle()
  })

  it('a tela aplica um teto ao expandir, e não só o decodificador sabe disso', async () => {
    // A mutação que ninguém matava: `decodeBody(result, Number.MAX_SAFE_INTEGER)`
    // no ponto de chamada deixava a suíte inteira verde. O C9 estava provado em
    // duas metades desconexas e nada ligava as duas.
    const grande = 'a'.repeat(MAX_DECOMPRESSED_BYTES + 4096)
    const source = new ReadableStream<BufferSource>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(grande))
        controller.close()
      },
    })
    const reader = source.pipeThrough(new CompressionStream('gzip')).getReader()
    const bytes: number[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes.push(...value)
    }

    const port = testRequestsPort({
      requests: [request('r1', 'uma')],
      execute: async () =>
        executed({
          encoding: 'base64',
          body: btoa(String.fromCharCode(...bytes)),
          headers: [{ name: 'content-encoding', value: 'gzip' }],
        }),
    })
    const { host } = mount(deps(port))
    await settle()

    await click(allAt(host, 'request')[0]!)
    await click(at(host, 'execute'))
    await until(() => at(host, 'response') !== null)

    expect(at(host, 'body-truncated')).not.toBeNull()
  }, 60_000)
})
