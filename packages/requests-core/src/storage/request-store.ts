import type { ProtocolSpec } from '../protocol.js'
import type { Folder } from './folder.js'

/** Uma request guardada: o envelope, mais onde ela está na árvore. */
export interface SavedRequest extends ProtocolSpec {
  readonly folderId: string | null
  readonly position: number
}

/**
 * O `spec` guardado não é JSON — e isso não pode derrubar a coleção inteira.
 *
 * O C4 diz que o banco é fronteira de confiança e que a recusa nomeia o campo
 * em vez de virar 500. Um spec que **não parseia** escapava de todo esse
 * mecanismo: o erro subia de dentro do store, abaixo de qualquer `catch`, e
 * levava junto o `GET /requests` — então a interface nem conseguia mostrar
 * qual request apagar.
 */
export class CorruptSpecError extends Error {
  override readonly name = 'CorruptSpecError'
  constructor(readonly id: string) {
    super(
      `a request ${id} tem um spec que não é JSON válido. ` +
        'Ela aparece na listagem com `spec: null` para poder ser apagada.',
    )
  }
}

export class FolderNotFoundError extends Error {
  override readonly name = 'FolderNotFoundError'
  constructor(id: string) {
    super(`não existe pasta com id ${id} — salvar aqui deixaria a request órfã na listagem`)
  }
}

/**
 * A port que o módulo do servidor implementa sobre SQLite.
 *
 * Ela vive neste pacote, e não no servidor, pela mesma razão que o
 * `EntryRepository` vive no `@dailly/domain`: quem declara a necessidade é
 * quem a consome. Se ela nascesse no adapter, cresceria no formato da tabela
 * em vez do formato do uso.
 *
 * O que ela **não** tem: nada sobre executar. Executar é efeito e mora no
 * servidor ([ADR 0011](../../../../docs/adrs/0011-requests-modulo-e-execucao.md));
 * guardar é outro trabalho, e juntá-los faria um teste de persistência
 * precisar de rede.
 */
export interface RequestStore {
  saveRequest(request: SavedRequest): Promise<SavedRequest>
  requests(): Promise<SavedRequest[]>
  requestById(id: string): Promise<SavedRequest | undefined>
  deleteRequest(id: string): Promise<void>

  saveFolder(folder: Folder): Promise<Folder>
  folders(): Promise<Folder[]>
  /** Move uma pasta, recusando o que fecharia laço (`FolderCycleError`). */
  moveFolder(id: string, parentId: string | null): Promise<void>
}
