import { type Folder, type RequestStore, type SavedRequest, reparent } from '@dailly/requests-core'
import { FolderNotFoundError } from '@dailly/requests-core'
import type { Database } from 'better-sqlite3'

interface RequestRow {
  readonly id: string
  readonly folder_id: string | null
  readonly name: string
  readonly protocol: string
  readonly spec: string
  readonly position: number
}

interface FolderRow {
  readonly id: string
  readonly parent_id: string | null
  readonly name: string
  readonly position: number
}

/**
 * O outro lado do `RequestStore`, sobre SQLite — e ele mora **dentro do
 * módulo**, ao contrário do `sqliteEntryRepository`.
 *
 * A assimetria tem duas causas, e as duas são do caso e não do gosto.
 *
 * O adapter do entries foi para `adapters/` porque o composition root precisa
 * construí-lo, e importá-lo de dentro de `modules/` faria o shell conhecer um
 * módulo pelo nome — o que o C3 proíbe. Aqui o composition root **não** o
 * toca: quem o constrói é o `provide` do próprio módulo.
 *
 * E a propriedade que a ADR 0006, Emenda 2, registrou como custo lá — o
 * adapter lendo o schema privado de outro módulo, acoplamento que não carrega
 * import e que nenhuma regra vê — simplesmente não existe aqui. As tabelas
 * `requests` e `request_folders` são deste módulo, criadas pela migration
 * deste módulo, lidas pelo código deste módulo. Separá-los criaria de graça o
 * problema que lá foi aceito a contragosto.
 */
export function sqliteRequestStore({ db }: { db: Database }): RequestStore {
  const toRequest = (row: RequestRow): SavedRequest => ({
    id: row.id,
    name: row.name,
    protocol: row.protocol,
    // O `spec` é JSON opaco para o banco; quem o valida é o driver do
    // protocolo, do outro lado desta fronteira.
    spec: JSON.parse(row.spec) as unknown,
    folderId: row.folder_id,
    position: row.position,
  })

  const toFolder = (row: FolderRow): Folder => ({
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    position: row.position,
  })

  const assertFolderExists = (id: string | null): void => {
    if (id === null) return
    const found = db.prepare('SELECT 1 FROM request_folders WHERE id = ?').get(id)
    if (!found) throw new FolderNotFoundError(id)
  }

  return {
    async saveRequest(request) {
      assertFolderExists(request.folderId)
      db.prepare(
        `INSERT INTO requests (id, folder_id, name, protocol, spec, position)
         VALUES (@id, @folderId, @name, @protocol, @spec, @position)
         ON CONFLICT(id) DO UPDATE SET
           folder_id = excluded.folder_id, name = excluded.name,
           protocol = excluded.protocol, spec = excluded.spec, position = excluded.position`,
      ).run({
        id: request.id,
        folderId: request.folderId,
        name: request.name,
        protocol: request.protocol,
        spec: JSON.stringify(request.spec),
        position: request.position,
      })
      return request
    },

    async requests() {
      const rows = db
        .prepare('SELECT * FROM requests ORDER BY position, id')
        .all() as RequestRow[]
      return rows.map(toRequest)
    },

    async requestById(id) {
      const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as
        | RequestRow
        | undefined
      return row ? toRequest(row) : undefined
    },

    async deleteRequest(id) {
      db.prepare('DELETE FROM requests WHERE id = ?').run(id)
    },

    async saveFolder(folder) {
      assertFolderExists(folder.parentId)
      db.prepare(
        `INSERT INTO request_folders (id, parent_id, name, position)
         VALUES (@id, @parentId, @name, @position)
         ON CONFLICT(id) DO UPDATE SET
           parent_id = excluded.parent_id, name = excluded.name, position = excluded.position`,
      ).run(folder)
      return folder
    },

    async folders() {
      const rows = db
        .prepare('SELECT * FROM request_folders ORDER BY position, id')
        .all() as FolderRow[]
      return rows.map(toFolder)
    },

    async moveFolder(id, parentId) {
      assertFolderExists(parentId)
      const rows = db.prepare('SELECT * FROM request_folders').all() as FolderRow[]
      // A regra de ciclo é do modelo e roda antes do `UPDATE`: em SQL ela
      // seria um `CHECK` recursivo que só o SQLite entenderia, e ela precisa
      // valer igual no fake em memória.
      reparent(rows.map(toFolder), id, parentId)
      db.prepare('UPDATE request_folders SET parent_id = ? WHERE id = ?').run(parentId, id)
    },
  }
}
