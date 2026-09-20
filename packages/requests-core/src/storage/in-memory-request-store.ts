import { FolderCycleError, type Folder, assertNoCycle } from './folder.js'
import { FolderNotFoundError, type RequestStore, type SavedRequest } from './request-store.js'

/**
 * A implementação em memória — escrita à mão, e um módulo de verdade.
 *
 * Ela existe para que um teste de quem usa a port não precise de arquivo, e
 * para que o contrato tenha **duas** implementações provadas contra a mesma
 * suíte. Uma port com uma implementação só é uma interface decorativa.
 */
export function inMemoryRequestStore(): RequestStore {
  let requests: SavedRequest[] = []
  let folders: Folder[] = []

  /** Mover o que não existe respondia sucesso: o `UPDATE` batia em zero linhas. */
  const assertMovedExists = (id: string): void => {
    if (!folders.some((folder) => folder.id === id)) throw new FolderNotFoundError(id)
  }

  const assertFolderExists = (id: string | null): void => {
    if (id !== null && !folders.some((folder) => folder.id === id)) {
      throw new FolderNotFoundError(id)
    }
  }

  return {
    async saveRequest(request) {
      assertFolderExists(request.folderId)
      requests = [...requests.filter((saved) => saved.id !== request.id), request]
      return request
    },

    async requests() {
      return [...requests].sort((a, b) => a.position - b.position)
    },

    async requestById(id) {
      return requests.find((request) => request.id === id)
    },

    async deleteRequest(id) {
      requests = requests.filter((request) => request.id !== id)
    },

    async saveFolder(folder) {
      assertFolderExists(folder.parentId)
      // Salvar é upsert, então ele também reparenta — e C6 é propriedade da
      // árvore, não do verbo "mover".
      assertNoCycle(folders, folder.id, folder.parentId)
      folders = [...folders.filter((saved) => saved.id !== folder.id), folder]
      return folder
    },

    async folders() {
      return [...folders].sort((a, b) => a.position - b.position)
    },

    async moveFolder(id, parentId) {
      assertMovedExists(id)
      assertFolderExists(parentId)
      // A regra mora no modelo e é a mesma nas duas implementações — é por isso
      // que ela é função pura e não `CHECK` de SQL.
      assertNoCycle(folders, id, parentId)
      folders = folders.map((folder) => (folder.id === id ? { ...folder, parentId } : folder))
    },
  }
}

export { FolderCycleError }
