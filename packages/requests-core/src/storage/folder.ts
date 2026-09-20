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

/**
 * O laço se fecharia? — a pergunta, separada da operação que a faz.
 *
 * Ela nasceu separada depois de o gate mostrar que a regra tinha **duas
 * portas** e só uma trancada: `moveFolder` chamava `reparent` e recusava,
 * enquanto `saveFolder` — que é upsert — trocava o pai sem checar nada. O
 * contract test passava porque só exercitava o verbo "mover".
 *
 * C6 é propriedade da **árvore**, não do verbo. Toda escrita que mexe em
 * `parentId` pergunta aqui.
 */
export function wouldCycle(
  folders: readonly Folder[],
  id: string,
  parentId: string | null,
): boolean {
  if (parentId === null) return false
  if (parentId === id) return true
  return descendantsOf(folders, id).includes(parentId)
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
/** A mesma pergunta, na forma que interrompe — para quem escreve sem remapear a árvore. */
export function assertNoCycle(
  folders: readonly Folder[],
  id: string,
  parentId: string | null,
): void {
  if (!wouldCycle(folders, id, parentId)) return
  throw new FolderCycleError(nameOf(folders, id), nameOf(folders, parentId ?? id))
}

export function reparent(
  folders: readonly Folder[],
  id: string,
  parentId: string | null,
): Folder[] {
  assertNoCycle(folders, id, parentId)
  return folders.map((folder) => (folder.id === id ? { ...folder, parentId } : folder))
}
