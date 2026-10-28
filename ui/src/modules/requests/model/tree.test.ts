import type { Folder, SavedRequest } from '@dailly/requests-core'
import { describe, expect, it } from 'vitest'
import { buildTree, canDrop, endPosition, methodOf, totals } from './tree.js'

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

describe('árvore estilo Apidog: as contas e as regras de soltar', () => {
  const folders = [
    folder('konsi', null),
    folder('trigger', 'konsi'),
    folder('local', 'trigger'),
    folder('n8n', 'konsi'),
    folder('vazia', null),
  ]
  const requests = [
    request('a', 'local', 0),
    request('b', 'local', 1),
    request('c', 'trigger', 0),
    request('d', 'n8n', 0),
    request('solta', null, 3),
  ]
  const tree = buildTree(folders, requests)
  const konsi = tree.folders.find((node) => node.folder.id === 'konsi')!

  it('o total de uma pasta conta as requests de toda a descendência, e as subpastas', () => {
    expect(totals(konsi)).toEqual({ requests: 4, folders: 3 })
    expect(totals(tree.folders.find((node) => node.folder.id === 'vazia')!)).toEqual({
      requests: 0,
      folders: 0,
    })
  })

  it('uma request pode ir para outra pasta ou para a raiz, mas não para onde já está', () => {
    expect(canDrop(folders, { kind: 'request', item: request('a', 'local') }, 'n8n')).toBe(true)
    expect(canDrop(folders, { kind: 'request', item: request('a', 'local') }, null)).toBe(true)
    expect(canDrop(folders, { kind: 'request', item: request('a', 'local') }, 'local')).toBe(false)
  })

  it('uma pasta não pode ir para dentro dela mesma nem da descendência dela', () => {
    const trigger = { kind: 'folder', item: folders[1]! } as const
    expect(canDrop(folders, trigger, 'trigger')).toBe(false)
    expect(canDrop(folders, trigger, 'local')).toBe(false)
    expect(canDrop(folders, trigger, 'konsi')).toBe(false) // já está lá
    expect(canDrop(folders, trigger, 'n8n')).toBe(true)
    expect(canDrop(folders, trigger, null)).toBe(true)
  })

  it('quem é solto entra no fim do destino', () => {
    expect(endPosition(tree, 'local', 'request')).toBe(2)
    expect(endPosition(tree, null, 'request')).toBe(4)
    expect(endPosition(tree, 'vazia', 'request')).toBe(0)
    expect(endPosition(tree, 'konsi', 'folder')).toBe(1)
  })

  it('o método vem do spec HTTP, e outro protocolo mostra o nome dele', () => {
    expect(methodOf(request('a', null))).toBe('GET')
    expect(methodOf({ ...request('a', null), spec: { method: 'post' } })).toBe('POST')
    expect(methodOf({ ...request('a', null), protocol: 'grpc', spec: {} })).toBe('GRPC')
  })
})
