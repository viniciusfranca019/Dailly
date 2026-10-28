import type { Folder, SavedRequest } from '@dailly/requests-core'
import { type InjectionKey, type Ref, inject } from 'vue'
import type { Dragged } from './tree.js'

/** Um item da árvore: o alvo de um menu, de um renomear, de um apagar. */
export type Item =
  | { readonly kind: 'folder'; readonly item: Folder }
  | { readonly kind: 'request'; readonly item: SavedRequest }

/** O que o menu ⋯ e o clique direito oferecem. */
export type Action = 'new-request' | 'new-folder' | 'rename' | 'delete'

/** Renomeando ou confirmando a exclusão de um item — um por vez. */
export interface Editing {
  readonly mode: 'rename' | 'delete'
  readonly target: Item
}

/**
 * O que toda linha da árvore precisa, em qualquer profundidade.
 *
 * `provide`/`inject` e não emits encadeados: a árvore é recursiva, e cada
 * ação nova (renomear, apagar, arrastar) seria mais um emit repetido em cada
 * nível do `FolderNode`. O dono continua sendo o `Collections`, que é quem
 * fala com a tela por emits — o contexto só encurta o caminho até ele.
 */
export interface TreeContext {
  readonly selected: Readonly<Ref<string | null>>
  isOpen(id: string): boolean
  toggle(id: string): void

  readonly dragging: Readonly<Ref<Dragged | null>>
  startDrag(dragged: Dragged): void
  endDrag(): void
  canDropOn(target: string | null): boolean
  dropOn(target: string | null): void
  /** Diz qual alvo está sob o ponteiro — `undefined` é nenhum. */
  hover(target: string | null | undefined): void
  /** Se `target` é o alvo sob o ponteiro e aceita o que se arrasta. */
  isLit(target: string | null): boolean

  readonly editing: Readonly<Ref<Editing | null>>
  readonly renameError: Readonly<Ref<string | null>>
  act(target: Item | null, action: Action): void
  rename(target: Item, name: string): void
  remove(target: Item): void
  cancel(): void

  pick(request: SavedRequest): void
}

export const TREE: InjectionKey<TreeContext> = Symbol('requests-tree')

export function useTree(): TreeContext {
  const tree = inject(TREE)
  if (!tree) throw new Error('uma linha da árvore só existe dentro do Collections')
  return tree
}

/** As ações de cada nível, na ordem em que o menu as mostra. */
export function actionsFor(target: Item | null): readonly Action[] {
  if (target === null) return ['new-request', 'new-folder']
  if (target.kind === 'folder') return ['new-request', 'new-folder', 'rename', 'delete']
  return ['rename', 'delete']
}
