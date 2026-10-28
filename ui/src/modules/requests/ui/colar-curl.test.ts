// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  settle,
  mount,
  at,
  allAt,
  text,
  click,
  fill,
  folder,
  request,
  executed,
  deps,
  novaRequest,
  held,
  CURL,
  registered,
  addEventListener,
  inputLikeABrowser,
} from './test-harness.js'
import { type RequestsPort } from '@shared'
import { testRequestsPort } from '@shared/testing.js'

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

describe('colar um curl num navegador de verdade', () => {
  beforeEach(() => {
    HTMLInputElement.prototype.addEventListener = function (
      this: HTMLInputElement,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (type === 'input') registered.set(this, [...(registered.get(this) ?? []), listener])
      addEventListener.call(this, type, listener, options)
    }
  })
  afterEach(() => {
    HTMLInputElement.prototype.addEventListener = addEventListener
  })

  it('recria a request com método, URL, header e body', async () => {
    const { host } = mount(deps(testRequestsPort()))
    await settle()

    await novaRequest(host)
    await inputLikeABrowser(
      at(host, 'url'),
      `curl -X POST https://httpbin.org/post -H 'X-Teste: 1' -d '{"a":1}'`,
    )

    expect(at<HTMLInputElement>(host, 'method')?.value).toBe('POST')
    expect(at<HTMLInputElement>(host, 'url')?.value).toBe('https://httpbin.org/post')
    expect(at<HTMLInputElement>(host, 'header-name')?.value).toBe('X-Teste')
    expect(at<HTMLInputElement>(host, 'header-value')?.value).toBe('1')
    await click(at(host, 'tab-body'))
    expect(at<HTMLTextAreaElement>(host, 'body')?.value).toBe('{"a":1}')
  })

  it('digitar um curl tecla a tecla não importa nada', async () => {
    const { host } = mount(deps(testRequestsPort()))
    await settle()
    await novaRequest(host)

    const texto = `curl https://x.dev -H 'A: 1'`
    for (let fim = 1; fim <= texto.length; fim++) {
      await inputLikeABrowser(at(host, 'url'), texto.slice(0, fim), 'insertText')
    }

    expect(at<HTMLInputElement>(host, 'url')?.value).toBe(texto)
    expect(at<HTMLInputElement>(host, 'method')?.value).toBe('GET')
    expect(at(host, 'header-name')).toBeNull()
  })

  it('o segundo curl colado também importa', async () => {
    // O caso que o `watch` antigo existia para cobrir: depois de um import, o
    // "antes" é a URL curta, e a próxima colagem tem que ser salto.
    const { host } = mount(deps(testRequestsPort()))
    await settle()
    await novaRequest(host)

    await inputLikeABrowser(at(host, 'url'), `curl https://x.dev/um -H 'A: 1'`)
    await inputLikeABrowser(at(host, 'url'), `curl -X PUT https://x.dev/dois`)

    expect(at<HTMLInputElement>(host, 'method')?.value).toBe('PUT')
    expect(at<HTMLInputElement>(host, 'url')?.value).toBe('https://x.dev/dois')
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
