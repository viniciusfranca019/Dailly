// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
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
  novaPasta,
  held,
  CURL,
  drag,
  rightClick,
  folderRow,
  requestRow,
  menuOf,
  menuItems,
} from './test-harness.js'
import { type RequestsPort } from '@shared'
import { testRequestsPort } from '@shared/testing.js'

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
    // As pastas começam fechadas (a árvore do Apidog): abrir é o gesto de ver.
    await click(host.querySelector<HTMLElement>('[data-testid="folder"][data-folder-id="f1"]'))
    await click(host.querySelector<HTMLElement>('[data-testid="folder"][data-folder-id="f2"]'))

    expect(allAt(host, 'folder').map((node) => node.dataset['folderId'])).toEqual(['f1', 'f2'])
    expect(allAt(host, 'request-name').map((node) => node.textContent?.trim())).toEqual([
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
    expect(allAt(host, 'request-name').map((node) => node.textContent?.trim())).toEqual([
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

    expect(allAt(host, 'folder-label').map((node) => node.textContent?.trim())).toContain('Stripe')
    expect(await port.folders()).toHaveLength(1)
  })
  // A recusa de criar pasta é exercitada em "uma pasta recusada não leva junto
  // o nome digitado", que cobre isto e mais: onde a mensagem aparece e que o
  // que foi digitado sobrevive. Este teste pedia menos do mesmo.
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

describe('a árvore no jeito do Apidog', () => {
  beforeEach(() => {
    try {
      localStorage.clear()
    } catch {
      // sem storage, cada teste já começa limpo
    }
  })

  const seeded = () =>
    testRequestsPort({
      folders: [folder('konsi', 'Konsi'), folder('trigger', 'message_trigger', 'konsi'), folder('n8n', 'n8n')],
      requests: [
        { ...request('a', 'List Templates', 'trigger') },
        {
          ...request('b', 'send message', 'trigger'),
          spec: { method: 'POST', url: 'https://x.dev/b', headers: [], body: null, query: [], auth: null },
        },
        request('c', 'raiz', null),
      ],
    })

  it('árvore C1, C2: a pasta mostra quantas requests carrega na descendência, e começa fechada', async () => {
    const { host } = mount(deps(seeded()))
    await settle()

    expect(folderRow(host, 'konsi')?.textContent).toContain('Konsi')
    expect(text(host, 'folder-count')).toContain('(2)')
    expect(folderRow(host, 'konsi')?.getAttribute('aria-expanded')).toBe('false')
    expect(requestRow(host, 'a')).toBeNull()
  })

  it('árvore C1, C2: abrir mostra o conteúdo com o método, e é lembrado ao remontar', async () => {
    const port = seeded()
    const first = mount(deps(port))
    await settle()

    await click(folderRow(first.host, 'konsi'))
    await click(folderRow(first.host, 'trigger'))

    expect(requestRow(first.host, 'b')?.querySelector('[data-testid="method"]')?.textContent).toBe('POST')
    expect(requestRow(first.host, 'a')?.querySelector('[data-testid="method"]')?.getAttribute('data-method')).toBe(
      'GET',
    )
    first.destroy()

    const second = mount(deps(port))
    await settle()
    expect(requestRow(second.host, 'a')).not.toBeNull()
  })

  it('árvore C3, C11: o ⋯ substitui o +, e cada nível tem as suas opções', async () => {
    const { host } = mount(deps(seeded()))
    await settle()

    expect(at(host, 'add-root')?.textContent?.trim()).toBe('⋯')
    await click(at(host, 'add-root'))
    expect(menuItems(host)).toEqual(['Nova request', 'Nova pasta'])

    await click(menuOf(host, 'konsi'))
    expect(menuItems(host)).toEqual(['Nova request', 'Nova pasta', 'Renomear', 'Apagar'])

    await click(menuOf(host, 'c'))
    expect(menuItems(host)).toEqual(['Renomear', 'Apagar'])
  })

  it('árvore C4: o clique direito abre o mesmo menu, no ponto do mouse — na pasta, na request e no vazio', async () => {
    const { host } = mount(deps(seeded()))
    await settle()

    expect((await rightClick(folderRow(host, 'konsi'))).defaultPrevented).toBe(true)
    expect(menuItems(host)).toEqual(['Nova request', 'Nova pasta', 'Renomear', 'Apagar'])
    const aberto = host.querySelector<HTMLElement>('[role="menu"]')!
    expect([aberto.style.left, aberto.style.top]).toEqual(['40px', '60px'])

    await rightClick(requestRow(host, 'c'))
    expect(menuItems(host)).toEqual(['Renomear', 'Apagar'])

    await rightClick(at(host, 'collections'))
    expect(menuItems(host)).toEqual(['Nova request', 'Nova pasta'])

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await settle()
    expect(menuItems(host)).toEqual([])
  })

  it('árvore C5: arrastar uma request para outra pasta muda onde ela mora, e fica salvo', async () => {
    const port = seeded()
    const { host } = mount(deps(port))
    await settle()

    const { accepted } = await drag(requestRow(host, 'c'), folderRow(host, 'n8n'))

    expect(accepted).toBe(true)
    expect((await port.requests()).find((r) => r.id === 'c')?.folderId).toBe('n8n')
    expect(folderRow(host, 'n8n')?.querySelector('[data-testid="folder-count"]')?.textContent).toBe('(1)')
  })

  it('árvore C6: arrastar uma pasta para outra leva tudo junto, e para a raiz também vale', async () => {
    const port = seeded()
    const { host } = mount(deps(port))
    await settle()
    await click(folderRow(host, 'konsi'))

    await drag(folderRow(host, 'trigger'), folderRow(host, 'n8n'))
    expect((await port.folders()).find((f) => f.id === 'trigger')?.parentId).toBe('n8n')

    await click(folderRow(host, 'n8n'))
    await drag(folderRow(host, 'trigger'), at(host, 'collections'))
    expect((await port.folders()).find((f) => f.id === 'trigger')?.parentId).toBeNull()
  })

  it('árvore C7: uma pasta não aceita ser solta dentro dela mesma nem da descendência', async () => {
    const port = seeded()
    const { host } = mount(deps(port))
    await settle()
    await click(folderRow(host, 'konsi'))

    const own = await drag(folderRow(host, 'konsi'), folderRow(host, 'konsi'))
    const child = await drag(folderRow(host, 'konsi'), folderRow(host, 'trigger'))

    expect(own.accepted).toBe(false)
    expect(child.accepted).toBe(false)
    expect((await port.folders()).find((f) => f.id === 'konsi')?.parentId).toBeNull()
  })

  it('árvore C8: se o servidor recusa o movimento, a árvore fica como estava e diz o porquê', async () => {
    const base = seeded()
    const port: RequestsPort = {
      ...base,
      saveRequest: async () => {
        throw new Error('a API recusou')
      },
    }
    const { host } = mount(deps(port))
    await settle()

    await drag(requestRow(host, 'c'), folderRow(host, 'n8n'))

    expect(at(host, 'tree-error')?.getAttribute('role')).toBe('alert')
    expect(text(host, 'tree-error')).toContain('a API recusou')
    expect(requestRow(host, 'c')).not.toBeNull()
  })

  it('árvore C9: renomear uma pasta no lugar: Enter salva, Esc cancela, vazio é recusado', async () => {
    const port = seeded()
    const { host } = mount(deps(port))
    await settle()

    await click(menuOf(host, 'n8n'))
    await click(at(host, 'menu-rename'))
    const input = at<HTMLInputElement>(host, 'rename')!
    expect(input.value).toBe('n8n')

    await fill(input, '   ')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await settle()
    expect(text(host, 'rename-error')).not.toBe('')

    await fill(at(host, 'rename'), 'automações')
    at(host, 'rename')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await settle()
    expect((await port.folders()).find((f) => f.id === 'n8n')?.name).toBe('automações')
    expect(at(host, 'rename')).toBeNull()

    await click(menuOf(host, 'n8n'))
    await click(at(host, 'menu-rename'))
    await fill(at(host, 'rename'), 'outro')
    at(host, 'rename')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect((await port.folders()).find((f) => f.id === 'n8n')?.name).toBe('automações')
  })

  it('árvore C10: apagar uma pasta confirma dizendo quanto vai junto, e leva tudo', async () => {
    const port = seeded()
    const { host } = mount(deps(port))
    await settle()

    await click(menuOf(host, 'konsi'))
    await click(at(host, 'menu-delete'))

    expect(at(host, 'confirm-delete')?.getAttribute('role')).toBe('alertdialog')
    expect(text(host, 'confirm-delete')).toContain('2 requests')
    expect(text(host, 'confirm-delete')).toContain('1 subpasta')

    await click(at(host, 'confirm-delete-yes'))
    expect((await port.folders()).map((f) => f.id)).toEqual(['n8n'])
    expect((await port.requests()).map((r) => r.id)).toEqual(['c'])
  })

  it('árvore C8, C10: se o servidor recusa apagar, a recusa aparece e nada some', async () => {
    const base = seeded()
    const port: RequestsPort = {
      ...base,
      deleteFolder: async () => {
        throw new Error('a API recusou')
      },
    }
    const { host } = mount(deps(port))
    await settle()

    await click(menuOf(host, 'n8n'))
    await click(at(host, 'menu-delete'))
    await click(at(host, 'confirm-delete-yes'))

    expect(text(host, 'tree-error')).toContain('a API recusou')
    expect(folderRow(host, 'n8n')).not.toBeNull()
  })

  it('árvore C2: fechar uma pasta do caminho da request aberta não é desfeito por uma releitura', async () => {
    const port = seeded()
    const { host } = mount(deps(port))
    await settle()
    await click(folderRow(host, 'konsi'))
    await click(folderRow(host, 'trigger'))
    await click(requestRow(host, 'a'))
    await click(folderRow(host, 'trigger'))
    expect(folderRow(host, 'trigger')?.getAttribute('aria-expanded')).toBe('false')

    // Qualquer mudança na árvore relê a coleção.
    await click(menuOf(host, 'n8n'))
    await click(at(host, 'menu-rename'))
    await fill(at(host, 'rename'), 'automações')
    at(host, 'rename')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await settle()

    expect(folderRow(host, 'trigger')?.getAttribute('aria-expanded')).toBe('false')
  })

  it('árvore C7: só o alvo sob o ponteiro acende, e nada fica aceso depois de soltar', async () => {
    const { host } = mount(deps(seeded()))
    await settle()
    const lit = () => [...host.querySelectorAll<HTMLElement>('[data-drop-target]')].map((el) => el.dataset['dropTarget'])

    requestRow(host, 'c')!.dispatchEvent(new Event('dragstart', { bubbles: true }))
    at(host, 'collections')!.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }))
    folderRow(host, 'konsi')!.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }))
    await settle()
    expect(lit()).toEqual(['konsi'])

    folderRow(host, 'n8n')!.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }))
    await settle()
    expect(lit()).toEqual(['n8n'])

    folderRow(host, 'n8n')!.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }))
    requestRow(host, 'c')?.dispatchEvent(new Event('dragend', { bubbles: true }))
    await settle()
    expect(lit()).toEqual([])
  })

  it('árvore C1: cada método tem a sua cor, e o desconhecido é cinza', async () => {
    const spec = (method: string) => ({ method, url: 'https://x.dev', headers: [], body: null, query: [], auth: null })
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
    const { host } = mount(
      deps(testRequestsPort({ requests: methods.map((m) => ({ ...request(m, m), spec: spec(m) })) })),
    )
    await settle()
    const tone = (m: string) => requestRow(host, m)?.querySelector('[data-testid="method"]')?.className ?? ''

    expect(tone('GET')).toContain('text-green-400')
    expect(tone('POST')).toContain('text-orange-400')
    expect(tone('PUT')).toContain('text-blue-400')
    expect(tone('PATCH')).toContain('text-purple-400')
    expect(tone('DELETE')).toContain('text-red-400')
    expect(tone('OPTIONS')).toContain('text-gray-400')
  })

  it('árvore C5, C11: a árvore leva ao editor só o campo que mudou, sem apagar o que foi digitado', async () => {
    const port = seeded()
    const { host } = mount(deps(port))
    await settle()
    await click(requestRow(host, 'c'))

    await fill(at(host, 'name'), 'nome ainda não salvo')
    await drag(requestRow(host, 'c'), folderRow(host, 'n8n'))

    expect((await port.requests()).find((r) => r.id === 'c')?.folderId).toBe('n8n')
    expect(at<HTMLInputElement>(host, 'name')?.value).toBe('nome ainda não salvo')
    expect(at<HTMLSelectElement>(host, 'request-folder')?.value).toBe('n8n')
  })

  it('árvore C11, C12: renomear e apagar a request aberta acompanham o editor', async () => {
    const port = seeded()
    const { host } = mount(deps(port))
    await settle()
    await click(requestRow(host, 'c'))

    await click(menuOf(host, 'c'))
    await click(at(host, 'menu-rename'))
    await fill(at(host, 'rename'), 'renomeada')
    at(host, 'rename')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await settle()
    expect((await port.requests()).find((r) => r.id === 'c')?.name).toBe('renomeada')
    expect(at<HTMLInputElement>(host, 'name')?.value).toBe('renomeada')

    await click(menuOf(host, 'c'))
    await click(at(host, 'menu-rename'))
    await fill(at(host, 'rename'), 'desistida')
    at(host, 'rename')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(at(host, 'rename')).toBeNull()
    expect((await port.requests()).find((r) => r.id === 'c')?.name).toBe('renomeada')

    await click(menuOf(host, 'c'))
    await click(at(host, 'menu-delete'))
    await click(at(host, 'confirm-delete-yes'))
    expect((await port.requests()).map((r) => r.id)).not.toContain('c')
    expect(at(host, 'url')).toBeNull()
  })
})
