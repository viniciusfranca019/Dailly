/**
 * A árvore de coleções: `parentId` e `position`, sem tabela de fechamento.
 *
 * Com dezenas de pastas numa coleção pessoal, o caminho se calcula em memória
 * e uma tabela de fechamento seria estrutura para um problema que não existe.
 * O preço dessa escolha está logo abaixo: `parentId` sozinho não impede ciclo,
 * então a regra que impede mora aqui, em TypeScript puro, e não num
 * `CHECK` de SQL que só o SQLite entenderia.
 */
export interface Folder {
  readonly id: string
  readonly parentId: string | null
  readonly name: string
  /** Ordem entre irmãos — a ordenação é do usuário, não alfabética. */
  readonly position: number
}

export class FolderCycleError extends Error {
  override readonly name = 'FolderCycleError'
  constructor(moved: string, target: string) {
    super(
      `não dá para mover "${moved}" para dentro de "${target}": ` +
        `"${target}" está dentro de "${moved}". O resultado seria um laço — as duas pastas ` +
        'continuariam existindo e nenhuma teria raiz, então elas sumiriam da listagem.',
    )
  }
}

/**
 * Todos os ids abaixo de uma pasta, em qualquer profundidade.
 *
 * A guarda de visitados não é zelo: se um dado antigo ou um `INSERT` à mão já
 * trouxer o laço que esta regra existe para impedir, percorrer sem guarda
 * travaria o processo em vez de responder.
 */
export function descendantsOf(folders: readonly Folder[], id: string): string[] {
  const children = new Map<string | null, string[]>()
  for (const folder of folders) {
    children.set(folder.parentId, [...(children.get(folder.parentId) ?? []), folder.id])
  }

  const found: string[] = []
  const seen = new Set<string>([id])
  const queue = [...(children.get(id) ?? [])]

  while (queue.length > 0) {
    const next = queue.shift()!
    if (seen.has(next)) continue
    seen.add(next)
    found.push(next)
    queue.push(...(children.get(next) ?? []))
  }

  return found
}

/** A pasta pelo id, para as mensagens dizerem nome em vez de identificador. */
const nameOf = (folders: readonly Folder[], id: string): string =>
  folders.find((folder) => folder.id === id)?.name ?? id

/**
 * Move uma pasta, ou recusa — devolvendo uma árvore nova, nunca mutando a que
 * recebeu.
 *
 * Imutável porque quem chama frequentemente já desenhou a árvore antiga na
 * tela: mutar no lugar faria a recusa deixar a interface mostrando um estado
 * que o banco não tem.
 */
export function reparent(
  folders: readonly Folder[],
  id: string,
  parentId: string | null,
): Folder[] {
  if (parentId !== null) {
    if (parentId === id) throw new FolderCycleError(nameOf(folders, id), nameOf(folders, id))
    if (descendantsOf(folders, id).includes(parentId)) {
      throw new FolderCycleError(nameOf(folders, id), nameOf(folders, parentId))
    }
  }

  return folders.map((folder) => (folder.id === id ? { ...folder, parentId } : folder))
}
