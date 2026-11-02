import { fromPostman, type LiteralSecret, type Skipped } from '@dailly/requests-core/http'

/**
 * @file Importa o export do Apidog (coleção Postman v2.x) para o dailly, pela API.
 *
 * Pela API e não direto no SQLite: cada pasta e request passa pela mesma
 * validação que a tela usa, e o script não precisa saber onde o banco está —
 * só a porta. A conversão é do pacote (`fromPostman`); aqui fica o que é de
 * processo: checar a API, recusar duplicata e gravar na ordem.
 */

export const ROOT_FOLDER = 'Apidog'

export class ApiDownError extends Error {
  override readonly name = 'ApiDownError'
  constructor(baseUrl: string) {
    super(
      `a API do dailly não respondeu em ${baseUrl}. Suba-a com \`make start\` ` +
        '(ou aponte outra com DAILLY_URL) e rode de novo.',
    )
  }
}

export class AlreadyImportedError extends Error {
  override readonly name = 'AlreadyImportedError'
  constructor() {
    super(
      `já existe a pasta "${ROOT_FOLDER}" na raiz, e nada foi gravado. Para refazer a importação, ` +
        `apague a pasta "${ROOT_FOLDER}" na tela (vai junto tudo que está dentro) e rode de novo.`,
    )
  }
}

export class ImportWriteError extends Error {
  override readonly name = 'ImportWriteError'
  constructor(what: string, status: number, detail: string) {
    super(
      `a API recusou ${what} (${status}: ${detail}). O que veio antes já foi gravado: ` +
        `apague a pasta "${ROOT_FOLDER}" e rode de novo depois de corrigir.`,
    )
  }
}

export interface ImportReport {
  readonly folders: number
  readonly requests: number
  readonly variables: readonly string[]
  readonly literalSecrets: readonly LiteralSecret[]
  readonly skipped: readonly Skipped[]
}

export async function runImport(options: {
  readonly collection: unknown
  readonly baseUrl: string
  readonly nextId: () => string
  readonly fetch?: typeof globalThis.fetch
}): Promise<ImportReport> {
  const http = options.fetch ?? globalThis.fetch
  const url = (path: string) => `${options.baseUrl}${path}`

  // Antes de tudo: sem API não há o que fazer, e converter primeiro só
  // atrasaria a única mensagem que interessa.
  try {
    await http(url('/health'))
  } catch {
    throw new ApiDownError(options.baseUrl)
  }

  const existing = (await (await http(url('/requests/folders'))).json()) as { name: string; parentId: string | null }[]
  if (existing.some((folder) => folder.parentId === null && folder.name === ROOT_FOLDER)) {
    throw new AlreadyImportedError()
  }

  const converted = fromPostman(options.collection, { root: ROOT_FOLDER, nextId: options.nextId })

  const send = async (path: string, body: object, what: string) => {
    const response = await http(url(path), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new ImportWriteError(what, response.status, await response.text())
  }

  // Pai antes de filho: é a ordem em que `fromPostman` devolve, e a única em
  // que a chave estrangeira aceita.
  for (const folder of converted.folders) await send('/requests/folders', folder, `a pasta "${folder.name}"`)
  for (const request of converted.requests) await send('/requests', request, `a request "${request.name}"`)

  return {
    folders: converted.folders.length,
    requests: converted.requests.length,
    variables: converted.variables,
    literalSecrets: converted.literalSecrets,
    skipped: converted.skipped,
  }
}
