import { describe, expect, it } from 'vitest'
import { FolderCycleError, type Folder, descendantsOf, reparent } from './folder.js'

/**
 * C6 — uma pasta não pode virar descendente de si mesma.
 *
 * A árvore é `parentId` mais `position`, e não uma tabela de fechamento: com
 * dezenas de pastas numa coleção pessoal, o caminho se calcula em memória e a
 * tabela extra seria estrutura para um problema que não existe.
 *
 * O preço dessa escolha é exatamente este cenário: `parentId` não impede
 * ciclo sozinho. Um `UPDATE` que ponha uma pasta dentro da própria
 * descendência produz um laço que some da listagem — as duas pastas existem no
 * banco e nenhuma tem raiz, então a sidebar simplesmente não as mostra.
 */
const tree = (): Folder[] => [
  { id: 'raiz', parentId: null, name: 'APIs', position: 0 },
  { id: 'filha', parentId: 'raiz', name: 'Auth', position: 0 },
  { id: 'neta', parentId: 'filha', name: 'OAuth', position: 0 },
  { id: 'outra', parentId: null, name: 'Interno', position: 1 },
]

describe('C6: uma pasta não pode virar descendente de si mesma', () => {
  it('recusa mover uma pasta para dentro da própria filha', () => {
    expect(() => reparent(tree(), 'raiz', 'filha')).toThrow(FolderCycleError)
  })

  it('recusa também quando a descendência é indireta', () => {
    // O caso que um teste de um nível só deixaria passar.
    expect(() => reparent(tree(), 'raiz', 'neta')).toThrow(FolderCycleError)
  })

  it('recusa mover uma pasta para dentro dela mesma', () => {
    expect(() => reparent(tree(), 'filha', 'filha')).toThrow(FolderCycleError)
  })

  it('a árvore não muda quando a operação é recusada', () => {
    const before = tree()
    try {
      reparent(before, 'raiz', 'neta')
    } catch {
      /* esperado */
    }

    expect(before).toEqual(tree())
  })

  it('a mensagem nomeia as duas pastas, que é o que falta saber', () => {
    expect(() => reparent(tree(), 'raiz', 'neta')).toThrow(/APIs/)
    expect(() => reparent(tree(), 'raiz', 'neta')).toThrow(/OAuth/)
  })

  it('permite o movimento que não fecha laço', () => {
    const moved = reparent(tree(), 'neta', 'outra')

    expect(moved.find((folder) => folder.id === 'neta')?.parentId).toBe('outra')
  })

  it('permite levar uma pasta para a raiz', () => {
    expect(reparent(tree(), 'neta', null).find((f) => f.id === 'neta')?.parentId).toBeNull()
  })

  it('lista a descendência inteira, que é o que a regra pergunta', () => {
    expect(descendantsOf(tree(), 'raiz').sort()).toEqual(['filha', 'neta'])
    expect(descendantsOf(tree(), 'neta')).toEqual([])
  })

  it('não entra em laço infinito se o banco já estiver corrompido', () => {
    // Defesa contra o que esta regra existe para impedir, caso um dado antigo
    // ou um INSERT manual já traga o laço: percorrer sem guarda travaria o
    // processo em vez de responder.
    const broken: Folder[] = [
      { id: 'a', parentId: 'b', name: 'A', position: 0 },
      { id: 'b', parentId: 'a', name: 'B', position: 0 },
    ]

    expect(() => descendantsOf(broken, 'a')).not.toThrow()
  })
})
