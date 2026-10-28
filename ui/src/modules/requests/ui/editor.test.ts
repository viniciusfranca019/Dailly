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
  folder,
  request,
  deps,
  novaRequest,
  CURL,
} from './test-harness.js'
import { testRequestsPort } from '@shared/testing.js'

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

describe('os padrões de teclado, inteiros em vez de pela metade', () => {
  const key = async (element: HTMLElement | null, k: string) => {
    element?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
    await settle()
  }

  it('as abas são um tablist de verdade, com setas e painel ligado', async () => {
    // `aria-selected` num botão sem `role="tab"` não é válido, e o
    // `aria-controls` apontava para três ids que não existem — os painéis são
    // `v-if`. Meia semântica anuncia um contrato que não se cumpre; foi o
    // argumento que eu usei para recusar o padrão completo, e ele se vira
    // contra a versão que eu entreguei.
    const { host } = mount(deps(testRequestsPort()))
    await settle()
    await novaRequest(host)
    await fill(at(host, 'url'), CURL)

    const lista = host.querySelector('[role="tablist"]')
    expect(lista).not.toBeNull()

    const headers = at(host, 'tab-headers')!
    expect(headers.getAttribute('role')).toBe('tab')
    expect(headers.getAttribute('tabindex')).toBe('0')
    expect(at(host, 'tab-body')?.getAttribute('tabindex')).toBe('-1')

    // O painel existe e é o que a aba diz controlar.
    const painel = host.querySelector(`#${headers.getAttribute('aria-controls')}`)
    expect(painel?.getAttribute('role')).toBe('tabpanel')

    await key(headers, 'ArrowRight')
    expect(at(host, 'tab-body')?.getAttribute('aria-selected')).toBe('true')
    await key(at(host, 'tab-body'), 'ArrowLeft')
    expect(at(host, 'tab-headers')?.getAttribute('aria-selected')).toBe('true')
  })

  it('a aba Params avisa que tem algo lá dentro', async () => {
    // Ela não é a aba padrão, então a query do `-G` ficava invisível até
    // alguém clicar por acaso.
    const { host } = mount(deps(testRequestsPort()))
    await settle()
    await novaRequest(host)
    await fill(at(host, 'url'), 'curl -G https://x.dev -d q=1 -d p=2')

    expect(text(host, 'tab-params')).toContain('2')
  })

  it('o menu devolve o foco ao + de onde saiu', async () => {
    const { host } = mount(deps(testRequestsPort()))
    await settle()

    const mais = at(host, 'add-root')!
    await click(mais)
    // O foco vai para o primeiro item: um menu que abre e deixa o foco para
    // trás obriga a caçar com Tab o que acabou de ser pedido.
    expect(document.activeElement).toBe(at(host, 'menu-new-request'))

    await key(at(host, 'menu-new-request'), 'ArrowDown')
    expect(document.activeElement).toBe(at(host, 'menu-new-folder'))

    await key(at(host, 'menu-new-folder'), 'Escape')
    expect(at(host, 'menu-new-request')).toBeNull()
    expect(document.activeElement).toBe(mais)
  })

  it('um import recusado não deixa na tela o aviso do import anterior', async () => {
    const { host } = mount(deps(testRequestsPort()))
    await settle()
    await novaRequest(host)

    await fill(at(host, 'url'), 'curl --compressed -k https://x.dev')
    expect(text(host, 'ignored')).toContain('-k')

    await fill(at(host, 'url'), 'curl -X POST -H "a: b"')

    expect(at(host, 'import-error')).not.toBeNull()
    // O que foi ignorado era do curl anterior; ao lado do erro do novo, ele diz
    // que algo foi aplicado que não foi.
    expect(at(host, 'ignored')).toBeNull()
  })
})
