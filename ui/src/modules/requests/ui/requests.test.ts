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

  it('mostra a recusa do servidor em vez de uma frase genérica', async () => {
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

    expect(text(host, 'error')).toContain('o resultado seria um laço')
  })
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
          throw new ExecutionFailedError(kind, `cru: ${kind}`)
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
