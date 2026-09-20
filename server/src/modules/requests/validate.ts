import type { Folder, SavedRequest } from '@dailly/requests-core'

/**
 * O que a API confere antes de deixar algo entrar na coleção.
 *
 * O `spec` **não** é validado aqui de propósito: quem sabe o formato dele é o
 * driver do protocolo, e ele é conferido na hora de executar — que é quando o
 * formato importa. Guardar um spec que o driver recusaria é ruim; recusar de
 * antemão um spec de um protocolo que este servidor ainda não conhece seria
 * pior, porque impediria de salvar um rascunho.
 */
export interface Invalid {
  readonly field: string
  readonly message: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown): boolean => typeof value === 'string' && value.trim() !== ''

export function validateSavedRequest(
  payload: unknown,
): { request: SavedRequest } | { errors: Invalid[] } {
  if (!isRecord(payload)) {
    return { errors: [{ field: '', message: 'o corpo da requisição deve ser um objeto JSON' }] }
  }

  const errors: Invalid[] = []
  if (!text(payload['id'])) errors.push({ field: 'id', message: 'é obrigatório' })
  if (!text(payload['name'])) errors.push({ field: 'name', message: 'é obrigatório' })
  if (!text(payload['protocol'])) errors.push({ field: 'protocol', message: 'é obrigatório' })
  if (payload['spec'] === undefined) errors.push({ field: 'spec', message: 'é obrigatório' })
  if (payload['folderId'] !== null && typeof payload['folderId'] !== 'string') {
    errors.push({ field: 'folderId', message: 'deve ser um id ou nulo' })
  }
  if (typeof payload['position'] !== 'number') {
    errors.push({ field: 'position', message: 'deve ser um número' })
  }

  return errors.length > 0 ? { errors } : { request: payload as unknown as SavedRequest }
}

export function validateFolder(payload: unknown): { folder: Folder } | { errors: Invalid[] } {
  if (!isRecord(payload)) {
    return { errors: [{ field: '', message: 'o corpo da requisição deve ser um objeto JSON' }] }
  }

  const errors: Invalid[] = []
  if (!text(payload['id'])) errors.push({ field: 'id', message: 'é obrigatório' })
  if (!text(payload['name'])) errors.push({ field: 'name', message: 'é obrigatório' })
  if (payload['parentId'] !== null && typeof payload['parentId'] !== 'string') {
    errors.push({ field: 'parentId', message: 'deve ser um id ou nulo' })
  }
  if (typeof payload['position'] !== 'number') {
    errors.push({ field: 'position', message: 'deve ser um número' })
  }

  return errors.length > 0 ? { errors } : { folder: payload as unknown as Folder }
}
