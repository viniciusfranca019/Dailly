import type { Folder, SavedRequest } from '@dailly/requests-core'
import { describe, expect, it } from 'vitest'
import { buildTree } from './tree.js'

const folder = (id: string, parentId: string | null, name = id, position = 0): Folder => ({
  id,
  parentId,
  name,
  position,
})

const request = (id: string, folderId: string | null, position = 0): SavedRequest => ({
  id,
  name: id,
  protocol: 'http',
  spec: { method: 'GET', url: 'https://x.dev', headers: [], body: null, query: [], auth: null },
  folderId,
  position,
})

const names = (nodes: readonly { folder: Folder }[]) => nodes.map((node) => node.folder.id)

describe('C2: a árvore que o aside mostra', () => {
  it('aninha pastas por parentId', () => {
    const tree = buildTree(
      [folder('raiz', null), folder('filha', 'raiz'), folder('neta', 'filha')],
      [],
    )

    expect(names(tree.folders)).toEqual(['raiz'])
    expect(names(tree.folders[0]!.folders)).toEqual(['filha'])
    expect(names(tree.folders[0]!.folders[0]!.folders)).toEqual(['neta'])
  })

  it('põe cada request dentro da sua pasta', () => {
    const tree = buildTree([folder('raiz', null)], [request('a', 'raiz'), request('b', null)])

    expect(tree.folders[0]!.requests.map((r) => r.id)).toEqual(['a'])
    // Sem pasta é o caso comum de quem acabou de colar um curl, não um erro.
    expect(tree.requests.map((r) => r.id)).toEqual(['b'])
  })

  it('ordena irmãos por position, e desempata pelo nome', () => {
    // A ordem é do usuário (o `position` existe para isso). O desempate pelo
    // nome não é estética: sem ele duas pastas com a mesma posição trocam de
    // lugar entre dois renders e a árvore pisca.
    const tree = buildTree(
      [folder('b', null, 'B', 2), folder('a', null, 'A', 1), folder('c', null, 'C', 1)],
      [request('r2', null, 5), request('r1', null, 1)],
    )

    expect(names(tree.folders)).toEqual(['a', 'c', 'b'])
    expect(tree.requests.map((r) => r.id)).toEqual(['r1', 'r2'])
  })

  it('não perde uma pasta cujo pai não está na lista', () => {
    // Dado velho, ou uma leitura que pegou a pasta antes do pai chegar. Somir
    // com ela deixaria a pessoa sem como apagá-la — o mesmo raciocínio do
    // `CorruptSpecError`, que aparece na listagem justamente para poder sair.
    const tree = buildTree([folder('orfa', 'fantasma')], [])

    expect(names(tree.folders)).toEqual(['orfa'])
  })

  it('não perde uma request cuja pasta não está na lista', () => {
    const tree = buildTree([], [request('perdida', 'fantasma')])

    expect(tree.requests.map((r) => r.id)).toEqual(['perdida'])
  })

  it('não trava com um laço no dado, e mostra as duas pastas', () => {
    // O servidor recusa fechar laço, mas um banco escrito à mão não passa por
    // ele. Sem guarda, montar a árvore aqui seria recursão infinita — a janela
    // trava e nada na tela diz por quê.
    const tree = buildTree([folder('a', 'b'), folder('b', 'a')], [])

    expect(names(tree.folders).sort()).toEqual(['a', 'b'])
    // E cada uma aparece **uma** vez: a guarda não pode transformar o laço em
    // duplicata, que é a forma silenciosa do mesmo defeito.
    expect(names(tree.folders)).toHaveLength(2)
  })

  it('não duplica uma pasta que é filha de si mesma', () => {
    const tree = buildTree([folder('a', 'a')], [])

    expect(names(tree.folders)).toEqual(['a'])
    expect(tree.folders[0]!.folders).toEqual([])
  })
})
