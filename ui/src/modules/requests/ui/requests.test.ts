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

/**
 * O gesto inteiro, e não só o `click`.
 *
 * `mousedown` é o que fecha menu, e um helper que o pulava deixava duas
 * mutações do `AddMenu` sobreviverem à suíte inteira. Um teste que clica de um
 * jeito que nenhum navegador clica prova menos do que parece.
 */
const click = async (element: HTMLElement | null) => {
  for (const type of ['mousedown', 'mouseup', 'click']) {
    element?.dispatchEvent(new MouseEvent(type, { bubbles: true }))
  }
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

/**
 * Os dois caminhos que o `+` abre.
 *
 * Helpers e não cliques soltos porque agora são dois passos, e repetir os dois
 * em vinte testes esconderia qual deles quebrou quando um quebrar.
 */
const novaRequest = async (host: HTMLElement) => {
  await click(at(host, 'add-root'))
  await click(at(host, 'menu-new-request'))
}

const novaPasta = async (host: HTMLElement) => {
  await click(at(host, 'add-root'))
  await click(at(host, 'menu-new-folder'))
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

    await novaRequest(host)
    await fill(at(host, 'url'), CURL)

    // Método e URL ficam sempre à mão; o resto mora atrás da sua aba.
    expect(at<HTMLInputElement>(host, 'method')?.value).toBe('POST')
    expect(at<HTMLInputElement>(host, 'url')?.value).toBe('https://api.stripe.com/v1/charges')
    expect(at<HTMLInputElement>(host, 'header-name')?.value).toBe('Idempotency-Key')

    await click(at(host, 'tab-body'))
    expect(at<HTMLTextAreaElement>(host, 'body')?.value).toBe('{"amount":100}')
    // Importar não grava: a request só existe quando a pessoa manda salvar.
    expect(await port.requests()).toEqual([])
  })

  it('diz o que ignorou', async () => {
    const { host } = mount(deps(testRequestsPort()))
    await settle()

    await novaRequest(host)
    await fill(at(host, 'url'), 'curl --compressed -k https://x.dev')

    expect(text(host, 'ignored')).toContain('-k')
  })

  it('recusa com o motivo, e não importa nada', async () => {
    // O editor não fecha mais: ele é o lugar onde o curl entra. O que não pode
    // acontecer é a recusa passar por importação — método e headers ficam como
    // estavam, e a frase diz o que faltou.
    const { host } = mount(deps(testRequestsPort()))
    await settle()

    await novaRequest(host)
    await fill(at(host, 'url'), 'curl -X POST -H "a: b"')

    expect(at(host, 'import-error')?.getAttribute('role')).toBe('alert')
    expect(at<HTMLInputElement>(host, 'method')?.value).toBe('GET')
    expect(at(host, 'header-name')).toBeNull()
  })
})

describe('C6: salvar', () => {
  it('põe a request na árvore, dentro da pasta escolhida', async () => {
    const port = testRequestsPort({ folders: [folder('f1', 'Stripe')] })
    const { host } = mount(deps(port))
    await settle()

    await novaRequest(host)
    await fill(at(host, 'url'), CURL)
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

    await novaPasta(host)
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

    await novaPasta(host)
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
    expect(text(host, 'notice')).toContain('apag')

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

    await novaPasta(host)
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

    await novaRequest(host)
    await fill(at(host, 'url'), `curl https://x.dev -u '{{credencial}}'`)
    await click(at(host, 'tab-auth'))

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

    await novaRequest(host)
    await fill(at(host, 'url'), CURL)
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

    await novaRequest(host)
    await fill(at(host, 'url'), CURL)
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

    await novaRequest(host)
    await fill(at(host, 'url'), `curl https://x.dev -H 'A: 1' -H 'B: 2'`)

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

    await novaRequest(host)
    await fill(at(host, 'url'), CURL)
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

    await novaRequest(host)
    await fill(at(host, 'url'), CURL)

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

    await novaPasta(host)
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

  // "uma pasta nasce dentro da pasta-mãe escolhida" saiu daqui: com o `+` por
  // pasta, essa é a propriedade que os dois testes do C17 provam, e provam
  // melhor — a pasta-mãe deixou de ser um campo para ser o botão clicado.

  it('C6: o formulário fecha, e o "onde" nunca sobra da tentativa anterior', async () => {
    // Antes, a pasta-mãe era um select cujo valor sobrevivia ao sucesso, e a
    // pasta seguinte nascia num lugar que ninguém pediu. Agora o "onde" vem do
    // `+`, então a prova é: criar dentro do Stripe e depois criar pela raiz.
    const port = testRequestsPort({ folders: [folder('f1', 'Stripe')] })
    const { host } = mount(deps(port))
    await settle()

    await click(allAt(host, 'add-in-folder')[0]!)
    await click(at(host, 'menu-new-folder'))
    await fill(at(host, 'folder-name'), 'Charges')
    await click(at(host, 'save-folder'))

    // Fechou.
    expect(at(host, 'folder-name')).toBeNull()

    await novaPasta(host)
    expect(at<HTMLInputElement>(host, 'folder-name')?.value).toBe('')
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

    await novaPasta(host)
    await fill(at(host, 'folder-name'), 'Stripe')
    await click(at(host, 'save-folder'))
    expect(at(host, 'folder-error')).not.toBeNull()

    refuse = false
    await novaPasta(host)
    await novaPasta(host)

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

    await novaRequest(host)
    await fill(at(host, 'url'), CURL)
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
  }, 10_000)
})

describe('gate 3 — a terceira porta', () => {
  const two = () => [request('r1', 'uma'), { ...request('r2', 'outra'), position: 1 }]

  it('BLOCKER: um salvar em voo não ressuscita a request que foi apagada', async () => {
    // `save()` e `remove()` **liam** a sequência do editor e nenhum dos dois a
    // escrevia, e os dois botões eram clicáveis ao mesmo tempo. O DELETE
    // resolvia, a árvore esvaziava, e o POST atrasado reinseria a linha — o
    // que a pessoa mandou apagar voltava, sem nada dizendo.
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

    // Enquanto a gravação está em voo, Apagar não pode disparar.
    expect(at<HTMLButtonElement>(host, 'delete')?.disabled).toBe(true)
    await click(at(host, 'delete'))

    gate.release()
    await settle()

    expect((await port.requests()).map((saved) => saved.id)).toEqual(['r1', 'r2'])
  })

  it('BLOCKER: gravar enquanto apaga é recusado, como apagar enquanto grava', async () => {
    // A direção simétrica do mesmo guarda. É a exclusão mútua que fecha o
    // buraco — e é por ela existir que não há um segundo mecanismo (mover a
    // sequência do editor no apagar) que nenhum teste conseguiria alcançar.
    const gate = held()
    const port = testRequestsPort({ requests: two() })
    let calls = 0
    const slow: RequestsPort = {
      ...port,
      async deleteRequest(id) {
        await gate.promise
        return port.deleteRequest(id)
      },
      async saveRequest(saved) {
        calls += 1
        return port.saveRequest(saved)
      },
    }
    const { host } = mount(deps(slow))
    await settle()

    await click(allAt(host, 'request')[0]!)
    await click(at(host, 'delete'))

    expect(at<HTMLButtonElement>(host, 'save')?.disabled).toBe(true)
    await click(at(host, 'save'))
    expect(calls).toBe(0)

    gate.release()
    await settle()
    expect((await port.requests()).map((saved) => saved.id)).toEqual(['r2'])
  })

  it('MAJOR: a recusa de uma request não aparece anônima na tela de outra', async () => {
    const gate = held()
    const port = testRequestsPort({ requests: two() })
    const refusing: RequestsPort = {
      ...port,
      async saveRequest() {
        await gate.promise
        throw new Error('o servidor recusou')
      },
    }
    const { host } = mount(deps(refusing))
    await settle()

    await click(allAt(host, 'request')[0]!)
    await click(at(host, 'save'))
    await click(allAt(host, 'request')[1]!)
    gate.release()
    await settle()

    // A notícia não some — perder "não gravou" é pior que mostrá-la fora de
    // hora. Ela chega **nomeada**, dizendo de quem é.
    expect(text(host, 'error')).toContain('uma')
    expect(text(host, 'error')).toContain('o servidor recusou')
  })

  it('MAJOR: a recusa atrasada não apaga a explicação do spec ilegível', async () => {
    // Eram duas coisas no mesmo lugar: o aviso sobre a request selecionada e o
    // erro da última operação. O segundo comia o primeiro — e sumia com a
    // única explicação de por que aquela tela só tem botão de apagar. Pior: o
    // no-op do reclique tornava o erro grudento.
    const gate = held()
    const port = testRequestsPort({
      requests: [request('r1', 'uma'), { ...request('r2', 'quebrada'), spec: null, position: 1 }],
    })
    const refusing: RequestsPort = {
      ...port,
      async saveRequest() {
        await gate.promise
        throw new Error('o servidor recusou')
      },
    }
    const { host } = mount(deps(refusing))
    await settle()

    await click(allAt(host, 'request')[0]!)
    await click(at(host, 'save'))
    await click(allAt(host, 'request')[1]!)
    gate.release()
    await settle()

    expect(text(host, 'notice')).toContain('apag')
    expect(at(host, 'delete')).not.toBeNull()
  })

  it('um corpo que diz ser base64 e não é não leva junto status, tempo e headers', async () => {
    // `atob` estourava fora de qualquer `try` e a execução inteira virava
    // "Invalid character" — descartando o 200, os headers e o tempo, que
    // chegaram e estavam certos.
    const port = testRequestsPort({
      requests: [request('r1', 'uma')],
      execute: async () => executed({ encoding: 'base64', body: 'isto não é base64 %%%' }),
    })
    const { host } = mount(deps(port))
    await settle()

    await click(allAt(host, 'request')[0]!)
    await click(at(host, 'execute'))

    expect(text(host, 'response-status')).toContain('200')
    expect(at(host, 'response-opaque')).not.toBeNull()
    expect(at(host, 'execution-error')).toBeNull()
  })

  it('uma releitura que falha não troca a árvore correta por um banner', async () => {
    let reads = 0
    const port = testRequestsPort({ folders: [folder('f1', 'Stripe')] })
    const flaky: RequestsPort = {
      ...port,
      async folders() {
        reads += 1
        if (reads > 1) throw new Error('a releitura falhou')
        return port.folders()
      },
    }
    const { host } = mount(deps(flaky))
    await settle()
    expect(allAt(host, 'folder')).toHaveLength(1)

    await novaRequest(host)
    await fill(at(host, 'url'), CURL)
    await click(at(host, 'save'))

    expect(text(host, 'collections-error')).toContain('a releitura falhou')
    // E o que já estava certo continua na tela: o erro é aviso, não apagador.
    expect(allAt(host, 'folder')).toHaveLength(1)
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

describe('C14: o meio ganha o layout da categoria', () => {
  const abrir = async (host: HTMLElement) => {
    await novaRequest(host)
    await fill(at(host, 'url'), CURL)
  }

  it('põe método, URL e Enviar numa linha, e o resto em abas', async () => {
    const { host } = mount(deps(testRequestsPort()))
    await settle()
    await abrir(host)

    for (const aba of ['tab-params', 'tab-headers', 'tab-body', 'tab-auth']) {
      expect(at(host, aba), aba).not.toBeNull()
    }
    // O que não é aba fica sempre à mão: é com isto que se dispara a request.
    expect(at(host, 'method')).not.toBeNull()
    expect(at(host, 'url')).not.toBeNull()
    expect(at(host, 'execute')).not.toBeNull()
  })

  it('mostra uma aba por vez, e diz qual', async () => {
    const { host } = mount(deps(testRequestsPort()))
    await settle()
    await abrir(host)

    await click(at(host, 'tab-headers'))
    expect(at(host, 'tab-headers')?.getAttribute('aria-selected')).toBe('true')
    expect(at(host, 'header-name')).not.toBeNull()
    // `v-if` e não `v-show`: o campo da outra aba não está no documento, senão
    // um teste que esquecesse de trocar de aba passaria assim mesmo.
    expect(at(host, 'body')).toBeNull()

    await click(at(host, 'tab-body'))
    expect(at(host, 'tab-body')?.getAttribute('aria-selected')).toBe('true')
    expect(at(host, 'tab-headers')?.getAttribute('aria-selected')).toBe('false')
    expect(at(host, 'body')).not.toBeNull()
    expect(at(host, 'header-name')).toBeNull()
  })

  it('trocar de aba não perde o que foi digitado na outra', async () => {
    // O estado mora no rascunho, não no campo — mas isso é afirmação até
    // alguém provar, e o `v-if` destrói o input de verdade.
    const { host } = mount(deps(testRequestsPort()))
    await settle()
    await abrir(host)

    await click(at(host, 'tab-headers'))
    await fill(at(host, 'header-value'), 'k9')
    await click(at(host, 'tab-body'))
    await fill(at(host, 'body'), '{"amount":999}')
    await click(at(host, 'tab-headers'))

    expect(at<HTMLInputElement>(host, 'header-value')?.value).toBe('k9')

    await click(at(host, 'tab-body'))
    expect(at<HTMLTextAreaElement>(host, 'body')?.value).toBe('{"amount":999}')
  })

  it('a aba Auth deixa acrescentar Basic a uma request que veio sem', async () => {
    // Antes, o bloco de auth só existia se o curl trouxesse `-u`. Uma aba que
    // só sabe mostrar vazio é uma aba ruim.
    const { host } = mount(deps(testRequestsPort()))
    await settle()
    await abrir(host)

    await click(at(host, 'tab-auth'))
    expect(at(host, 'auth-user')).toBeNull()

    await click(at(host, 'add-auth'))
    expect(at(host, 'auth-user')).not.toBeNull()
    expect(at(host, 'auth-password')).not.toBeNull()
  })

  it('a aba Params mostra a query do -G, só para leitura neste corte', async () => {
    const { host } = mount(deps(testRequestsPort()))
    await settle()
    await novaRequest(host)
    await fill(at(host, 'url'), 'curl -G https://x.dev -d q=1 -d p=2')

    await click(at(host, 'tab-params'))
    expect(text(host, 'query')).toContain('q=1')
    expect(text(host, 'query')).toContain('p=2')
  })
})

describe('C15: o curl entra pela barra de URL', () => {
  it('colar um curl na URL preenche método, headers e corpo', async () => {
    const { host } = mount(deps(testRequestsPort()))
    await settle()

    await novaRequest(host)
    await fill(at(host, 'url'), CURL)

    expect(at<HTMLInputElement>(host, 'method')?.value).toBe('POST')
    expect(at<HTMLInputElement>(host, 'url')?.value).toBe('https://api.stripe.com/v1/charges')
    expect(at<HTMLInputElement>(host, 'header-name')?.value).toBe('Idempotency-Key')

    await click(at(host, 'tab-body'))
    expect(at<HTMLTextAreaElement>(host, 'body')?.value).toBe('{"amount":100}')
  })

  it('não confunde uma URL comum com um curl', async () => {
    // O gatilho é `curl` seguido de espaço. Uma URL nunca começa assim, e
    // reagir a qualquer texto faria o campo se reescrever enquanto se digita.
    const { host } = mount(deps(testRequestsPort()))
    await settle()

    await novaRequest(host)
    await fill(at(host, 'url'), 'https://curly.example.com/v1')

    expect(at<HTMLInputElement>(host, 'url')?.value).toBe('https://curly.example.com/v1')
    expect(at(host, 'import-error')).toBeNull()
  })

  it('diz o que ignorou, como o painel dizia', async () => {
    const { host } = mount(deps(testRequestsPort()))
    await settle()

    await novaRequest(host)
    await fill(at(host, 'url'), 'curl --compressed -k https://x.dev')

    expect(text(host, 'ignored')).toContain('-k')
  })

  it('um curl ilegível diz o motivo e não apaga o resto da request', async () => {
    const { host } = mount(deps(testRequestsPort()))
    await settle()

    await novaRequest(host)
    await fill(at(host, 'url'), 'https://x.dev/a')
    await click(at(host, 'tab-body'))
    await fill(at(host, 'body'), '{"guardado":true}')

    await fill(at(host, 'url'), 'curl -X POST -H "a: b"')

    expect(at(host, 'import-error')?.getAttribute('role')).toBe('alert')
    await click(at(host, 'tab-body'))
    expect(at<HTMLTextAreaElement>(host, 'body')?.value).toBe('{"guardado":true}')
  })

  it('importar pela URL preserva o nome e a pasta que a pessoa já escolheu', async () => {
    const { host } = mount(deps(testRequestsPort({ folders: [folder('f1', 'Stripe')] })))
    await settle()

    await novaRequest(host)
    await fill(at(host, 'name'), 'minha cobrança')
    const select = at<HTMLSelectElement>(host, 'request-folder')!
    select.value = 'f1'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await settle()

    await fill(at(host, 'url'), CURL)

    expect(at<HTMLInputElement>(host, 'name')?.value).toBe('minha cobrança')
    expect(at<HTMLSelectElement>(host, 'request-folder')?.value).toBe('f1')
  })

  it('o painel separado de colar curl não existe mais', async () => {
    const { host } = mount(deps(testRequestsPort()))
    await settle()

    await novaRequest(host)

    expect(at(host, 'curl')).toBeNull()
    expect(at(host, 'import-curl')).toBeNull()
    // E o editor abre pronto para receber, em vez de exigir um passo antes.
    expect(at(host, 'editor')).not.toBeNull()
  })
})

describe('C16, C17: um + no lugar dos dois botões', () => {
  const press = async (key: string) => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    await settle()
  }

  it('o cabeçalho tem um + que abre as duas opções', async () => {
    const { host } = mount(deps(testRequestsPort()))
    await settle()

    // Os dois botões de texto deram lugar a um só.
    expect(at(host, 'new-folder')).toBeNull()
    expect(at(host, 'add-root')).not.toBeNull()
    expect(at(host, 'add-root')?.getAttribute('aria-expanded')).toBe('false')

    await click(at(host, 'add-root'))
    expect(at(host, 'add-root')?.getAttribute('aria-expanded')).toBe('true')
    expect(at(host, 'menu-new-request')).not.toBeNull()
    expect(at(host, 'menu-new-folder')).not.toBeNull()
  })

  it('cada pasta tem o seu +, com nome acessível dizendo onde age', async () => {
    const { host } = mount(deps(testRequestsPort({ folders: [folder('f1', 'Stripe')] })))
    await settle()

    const mais = allAt(host, 'add-in-folder')
    expect(mais).toHaveLength(1)
    expect(mais[0]?.getAttribute('aria-label')).toContain('Stripe')
  })

  it('o menu fecha com Escape e com clique fora', async () => {
    const { host } = mount(deps(testRequestsPort()))
    await settle()

    await click(at(host, 'add-root'))
    await press('Escape')
    expect(at(host, 'menu-new-request')).toBeNull()

    await click(at(host, 'add-root'))
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await settle()
    expect(at(host, 'menu-new-request')).toBeNull()
  })

  it('C17: a request nova nasce na pasta em que o + foi clicado', async () => {
    const port = testRequestsPort({ folders: [folder('f1', 'Stripe')] })
    const { host } = mount(deps(port))
    await settle()

    await click(allAt(host, 'add-in-folder')[0]!)
    await click(at(host, 'menu-new-request'))
    await fill(at(host, 'url'), CURL)
    await click(at(host, 'save'))

    expect((await port.requests()).map((saved) => saved.folderId)).toEqual(['f1'])
  })

  it('C17: a pasta nova nasce dentro da pasta em que o + foi clicado', async () => {
    const port = testRequestsPort({ folders: [folder('f1', 'Stripe')] })
    const { host } = mount(deps(port))
    await settle()

    await click(allAt(host, 'add-in-folder')[0]!)
    await click(at(host, 'menu-new-folder'))
    await fill(at(host, 'folder-name'), 'Charges')
    await click(at(host, 'save-folder'))

    expect((await port.folders()).map((f) => [f.name, f.parentId])).toEqual([
      ['Stripe', null],
      ['Charges', 'f1'],
    ])
  })

  it('C17: pelo + do cabeçalho, nasce na raiz — e o select de pasta-mãe sumiu', async () => {
    const port = testRequestsPort({ folders: [folder('f1', 'Stripe')] })
    const { host } = mount(deps(port))
    await settle()

    await click(at(host, 'add-root'))
    await click(at(host, 'menu-new-folder'))

    // A pasta-mãe é implícita em qual + foi clicado; perguntar de novo num
    // select seria duas verdades para a mesma coisa.
    expect(at(host, 'folder-parent')).toBeNull()

    await fill(at(host, 'folder-name'), 'Refunds')
    await click(at(host, 'save-folder'))

    expect((await port.folders()).map((f) => [f.name, f.parentId])).toEqual([
      ['Stripe', null],
      ['Refunds', null],
    ])
  })
})

describe('o que o caminho novo do C15 abriu', () => {
  it('BLOCKER: a resposta da request velha não cai embaixo do curl novo', async () => {
    // `startPaste` movia as duas sequências antes de importar; `importInto`,
    // que o substituiu, não movia nenhuma. É o blocker do gate 3 de novo, pela
    // porta que o C15 abriu.
    const gate = held()
    const port = testRequestsPort({
      requests: [request('r1', 'uma')],
      execute: async () => {
        await gate.promise
        return executed({ status: 418 })
      },
    })
    const { host } = mount(deps(port))
    await settle()

    await click(allAt(host, 'request')[0]!)
    await click(at(host, 'execute'))

    await fill(at(host, 'url'), CURL)
    expect(at<HTMLInputElement>(host, 'method')?.value).toBe('POST')
    // O editor já é outra request: o botão dela não pode estar travado pela
    // execução da anterior.
    expect(at(host, 'running')).toBeNull()
    expect(at<HTMLButtonElement>(host, 'execute')?.disabled).toBe(false)

    gate.release()
    await settle()
    expect(at(host, 'response')).toBeNull()
  })

  it('BLOCKER: a gravação em voo não batiza o curl novo com a URL velha', async () => {
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

    await novaRequest(host)
    await fill(at(host, 'url'), 'https://velha.dev/a')
    await click(at(host, 'save'))

    await fill(at(host, 'url'), CURL)
    gate.release()
    await settle()

    expect(at<HTMLInputElement>(host, 'name')?.value).not.toBe('https://velha.dev/a')
  })

  it('MAJOR: abrir um + fecha o outro', async () => {
    // O `@mousedown.stop` matava o gesto antes de ele chegar ao documento, e o
    // menu anterior nunca sabia que devia fechar. Dois menus `absolute z-10`
    // sobrepostos: clicar no que parece ser o item de um acerta o do outro, e a
    // request nasce na pasta errada — o oposto do que o C17 promete.
    const { host } = mount(deps(testRequestsPort({ folders: [folder('f1', 'Stripe')] })))
    await settle()

    await click(at(host, 'add-root'))
    expect(allAt(host, 'menu-new-request')).toHaveLength(1)

    await click(allAt(host, 'add-in-folder')[0]!)
    expect(allAt(host, 'menu-new-request')).toHaveLength(1)
    expect(at(host, 'add-root')?.getAttribute('aria-expanded')).toBe('false')
  })

  it('o menu não fecha no próprio gesto que o abre', async () => {
    const { host } = mount(deps(testRequestsPort()))
    await settle()

    await click(at(host, 'add-root'))
    expect(at(host, 'menu-new-request')).not.toBeNull()
  })

  it('clicar no + de novo fecha, em vez de piscar e reabrir', async () => {
    // O teste acima não morde sozinho: o ouvinte de fora só é instalado
    // **depois** do `mousedown` que abre, então esse gesto nunca chega nele.
    // O caminho que morde é o segundo clique — sem o teste de alvo, o
    // `mousedown` fecha e o `click` seguinte reabre, e o menu nunca fecha pelo
    // botão que o abriu.
    const { host } = mount(deps(testRequestsPort()))
    await settle()

    await click(at(host, 'add-root'))
    await click(at(host, 'add-root'))

    expect(at(host, 'menu-new-request')).toBeNull()
    expect(at(host, 'add-root')?.getAttribute('aria-expanded')).toBe('false')
  })
})

describe('MAJOR: o formulário de pasta nasce onde o + foi clicado', () => {
  it('aparece dentro da pasta, e não no topo do aside', async () => {
    // `namingIn` guardava a pasta-mãe e não a mostrava: o formulário abria
    // sempre no topo, qualquer que fosse o `+`. Quem clica dez linhas abaixo
    // não vê nada acontecer perto de onde clicou — a pasta-mãe voltou a ser
    // invisível, que é o defeito que o `+` existia para matar.
    const { host } = mount(deps(testRequestsPort({ folders: [folder('f1', 'Stripe')] })))
    await settle()

    await click(allAt(host, 'add-in-folder')[0]!)
    await click(at(host, 'menu-new-folder'))

    const campo = at(host, 'folder-name')
    expect(campo).not.toBeNull()
    const pasta = host.querySelector('[data-folder-id="f1"]')?.closest('li')
    expect(pasta?.contains(campo!)).toBe(true)
  })

  it('pelo + do cabeçalho, aparece no topo', async () => {
    const { host } = mount(deps(testRequestsPort({ folders: [folder('f1', 'Stripe')] })))
    await settle()

    await novaPasta(host)

    const campo = at(host, 'folder-name')
    const pasta = host.querySelector('[data-folder-id="f1"]')?.closest('li')
    expect(pasta?.contains(campo!)).toBe(false)
  })

  it('o campo recebe o foco, porque foi ele que a pessoa pediu', async () => {
    const { host } = mount(deps(testRequestsPort()))
    await settle()

    await novaPasta(host)

    expect(document.activeElement).toBe(at(host, 'folder-name'))
  })

  it('pedir uma request nova fecha o formulário de pasta', async () => {
    // Senão ele fica aberto atrás, e o próximo Criar cria a pasta que a pessoa
    // já tinha desistido de criar.
    const { host } = mount(deps(testRequestsPort()))
    await settle()

    await novaPasta(host)
    await fill(at(host, 'folder-name'), 'Stripe')
    await novaRequest(host)

    expect(at(host, 'folder-name')).toBeNull()
  })
})

describe('o que só aparece quando o teste clica como um navegador clica', () => {
  it('escolher no menu fecha o menu', async () => {
    const { host } = mount(deps(testRequestsPort()))
    await settle()

    await click(at(host, 'add-root'))
    await click(at(host, 'menu-new-request'))

    expect(at(host, 'menu-new-request')).toBeNull()
    expect(at(host, 'add-root')?.getAttribute('aria-expanded')).toBe('false')
  })

  it('digitar um curl à mão não colapsa o que já foi digitado', async () => {
    // `curl h` já é um import válido: no sexto caractere o campo virava `h`, e
    // todo o resto — inclusive `-H 'A: 1'` — era anexado como URL comum. Sem
    // erro e sem aviso. E enquanto o texto era `curl ` o alerta de "sem URL"
    // acendia e apagava a cada tecla, que um leitor de tela lê inteiro.
    const { host } = mount(deps(testRequestsPort()))
    await settle()
    await novaRequest(host)

    const campo = at<HTMLInputElement>(host, 'url')!
    const texto = `curl https://x.dev -H 'A: 1'`
    for (let at_ = 1; at_ <= texto.length; at_++) {
      campo.value = texto.slice(0, at_)
      campo.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await settle()

    expect(at<HTMLInputElement>(host, 'url')?.value).toBe(texto)
    expect(at(host, 'import-error')).toBeNull()
  })

  it('colar continua importando, porque cola tudo de uma vez', async () => {
    const { host } = mount(deps(testRequestsPort()))
    await settle()
    await novaRequest(host)

    await fill(at(host, 'url'), CURL)

    expect(at<HTMLInputElement>(host, 'method')?.value).toBe('POST')
    expect(at<HTMLInputElement>(host, 'url')?.value).toBe('https://api.stripe.com/v1/charges')
  })
})
