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
  executed,
  deps,
  until,
  novaRequest,
  novaPasta,
  held,
  CURL,
} from './test-harness.js'
import { type RequestsPort } from '@shared'
import { testRequestsPort } from '@shared/testing.js'
import { MAX_DECOMPRESSED_BYTES } from '../model/decode.js'

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
