import { type Folder, type SavedRequest, wouldCycle } from '@dailly/requests-core'

/** Uma pasta e o que está dentro dela. */
export interface TreeFolder {
  readonly folder: Folder
  readonly folders: readonly TreeFolder[]
  readonly requests: readonly SavedRequest[]
}

export interface Tree {
  readonly folders: readonly TreeFolder[]
  /** As requests que não estão em pasta nenhuma — o caso de quem acabou de colar. */
  readonly requests: readonly SavedRequest[]
}

/** Ordem do usuário primeiro; o nome só desempata, para o render não piscar. */
const byPosition = <T extends { position: number; name: string; id: string }>(a: T, b: T) =>
  a.position - b.position || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)

/**
 * A pasta onde esta pasta **de fato** aparece, que nem sempre é a que ela diz.
 *
 * Duas coisas sobrevivem aqui em vez de sumir: um pai que não está na lista, e
 * um laço. O servidor recusa fechar laço, mas um banco escrito à mão não passa
 * por ele — e sem esta subida controlada montar a árvore seria recursão
 * infinita: a janela trava e nada na tela diz por quê. Uma pasta nessas duas
 * situações vira raiz, porque sumir com ela deixaria a pessoa sem como apagá-la.
 */
function effectiveParent(folder: Folder, byId: ReadonlyMap<string, Folder>): string | null {
  if (folder.parentId === null) return null
  if (!byId.has(folder.parentId)) return null

  const seen = new Set<string>([folder.id])
  let cursor = byId.get(folder.parentId)
  while (cursor !== undefined) {
    if (seen.has(cursor.id)) return null
    seen.add(cursor.id)
    cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId)
  }
  return folder.parentId
}

/**
 * Pastas e requests planas viram a árvore que o aside desenha.
 *
 * Puro e fora do componente de propósito: é a única parte disto que tem regra,
 * e regra dentro de um `.vue` só se testa montando um DOM.
 */
export function buildTree(
  folders: readonly Folder[],
  requests: readonly SavedRequest[],
): Tree {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))

  const children = new Map<string | null, Folder[]>()
  for (const folder of folders) {
    const parent = effectiveParent(folder, byId)
    children.set(parent, [...(children.get(parent) ?? []), folder])
  }

  const owned = new Map<string | null, SavedRequest[]>()
  for (const request of requests) {
    // Uma request apontando para pasta que não existe fica visível na raiz em
    // vez de desaparecer, pelo mesmo motivo: o que não aparece não se apaga.
    const folderId = request.folderId !== null && byId.has(request.folderId) ? request.folderId : null
    owned.set(folderId, [...(owned.get(folderId) ?? []), request])
  }

  // O grafo dos pais efetivos não tem laço, então a recursão termina.
  const build = (folder: Folder): TreeFolder => ({
    folder,
    folders: [...(children.get(folder.id) ?? [])].sort(byPosition).map(build),
    requests: [...(owned.get(folder.id) ?? [])].sort(byPosition),
  })

  return {
    folders: [...(children.get(null) ?? [])].sort(byPosition).map(build),
    requests: [...(owned.get(null) ?? [])].sort(byPosition),
  }
}

/**
 * Quanto uma pasta carrega, em toda a descendência: o `(83)` do Apidog conta
 * as requests das subpastas, e a confirmação de apagar diz quantas pastas vão
 * junto. Recursão aqui e não no componente, porque esta é a única função que
 * percorre a árvore — um segundo percurso no template divergiria deste.
 */
export function totals(node: TreeFolder): { requests: number; folders: number } {
  return node.folders.reduce(
    (sum, child) => {
      const inner = totals(child)
      return { requests: sum.requests + inner.requests, folders: sum.folders + 1 + inner.folders }
    },
    { requests: node.requests.length, folders: 0 },
  )
}

/** O que está sendo arrastado. */
export type Dragged =
  | { readonly kind: 'request'; readonly item: SavedRequest }
  | { readonly kind: 'folder'; readonly item: Folder }

/**
 * Se soltar `dragged` em `target` (`null` é a raiz) muda alguma coisa e é
 * permitido. Onde já está não acende, porque soltar ali não faria nada; a
 * descendência de uma pasta não acende, porque o servidor recusaria o laço —
 * e é a mesma regra (`wouldCycle`) que ele usa, não uma cópia.
 */
export function canDrop(folders: readonly Folder[], dragged: Dragged, target: string | null): boolean {
  if (dragged.kind === 'request') return dragged.item.folderId !== target
  if (dragged.item.parentId === target) return false
  return !wouldCycle(folders, dragged.item.id, target)
}

function nodeOf(nodes: readonly TreeFolder[], id: string): TreeFolder | undefined {
  for (const node of nodes) {
    if (node.folder.id === id) return node
    const found = nodeOf(node.folders, id)
    if (found) return found
  }
  return undefined
}

/** A posição que põe um item no fim do destino — reordenar ficou fora do escopo. */
export function endPosition(tree: Tree, target: string | null, kind: Dragged['kind']): number {
  const node = target === null ? tree : nodeOf(tree.folders, target)
  if (!node) return 0
  const positions =
    kind === 'request'
      ? node.requests.map((request) => request.position)
      : node.folders.map((child) => child.folder.position)
  return positions.length === 0 ? 0 : Math.max(...positions) + 1
}

/**
 * O rótulo colorido antes do nome: o método no HTTP, o nome do protocolo nos
 * outros. Lido com cuidado porque o `spec` é do protocolo, e um spec ilegível
 * já chega como `null` da listagem.
 */
export function methodOf(request: SavedRequest): string {
  if (request.protocol !== 'http') return request.protocol.toUpperCase()
  const method = (request.spec as { method?: unknown } | null)?.method
  return typeof method === 'string' && method.trim() !== '' ? method.toUpperCase() : 'HTTP'
}
