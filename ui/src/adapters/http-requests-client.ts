import type { Folder, SavedRequest } from '@dailly/requests-core'
import {
  ExecutionFailedError,
  MissingVariablesError,
  type ExecutedResponse,
  type RequestsPort,
  type ResponseHeader,
} from '@shared'
import type { ApiConfig } from './api.js'
import { ApiError, ApiUnreachableError } from './errors.js'
import { httpClient } from './http.js'

/**
 * `RequestsPort` sobre as rotas do módulo Requests do servidor.
 *
 * O trabalho real deste arquivo não é chamar `fetch` — é **traduzir**. De um
 * lado há status HTTP; do outro há o vocabulário que a tela entende, onde
 * "falta a variável `token`" e "o alvo não atendeu" são coisas diferentes
 * porque mandam a pessoa olhar para lugares diferentes. Essa tradução mora
 * aqui, no único lugar que conhece os dois idiomas.
 *
 * E é aqui que o payload é **validado**, não assumido. O gate do B2a pegou
 * exatamente o oposto do lado do servidor: valor que atravessa a fronteira e
 * é castado reaparece como `NaN` três telas adiante, longe da causa.
 */
export interface HttpRequestsClientDeps {
  readonly config: ApiConfig
  /** Injetado para um teste dirigir a fita sem servidor. */
  readonly fetch?: typeof globalThis.fetch
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const wrongShape = (what: string) => new ApiError(200, `a API respondeu ${what} num formato que não reconheço`)

const list = <T>(value: unknown, what: string, parse: (item: unknown) => T): T[] => {
  if (!Array.isArray(value)) throw wrongShape(what)
  return value.map(parse)
}

const parseFolder = (value: unknown): Folder => {
  if (
    !isRecord(value) ||
    typeof value['id'] !== 'string' ||
    typeof value['name'] !== 'string' ||
    typeof value['position'] !== 'number' ||
    (value['parentId'] !== null && typeof value['parentId'] !== 'string')
  ) {
    throw wrongShape('uma pasta')
  }
  return {
    id: value['id'],
    parentId: value['parentId'],
    name: value['name'],
    position: value['position'],
  }
}

const parseRequest = (value: unknown): SavedRequest => {
  if (
    !isRecord(value) ||
    typeof value['id'] !== 'string' ||
    typeof value['name'] !== 'string' ||
    typeof value['protocol'] !== 'string' ||
    typeof value['position'] !== 'number' ||
    (value['folderId'] !== null && typeof value['folderId'] !== 'string')
  ) {
    throw wrongShape('uma request')
  }
  return {
    id: value['id'],
    name: value['name'],
    protocol: value['protocol'],
    // `spec` fica como veio, inclusive `null`: é assim que o servidor lista uma
    // request com spec corrompido, e é o que permite apagá-la. Exigir objeto
    // aqui derrubaria a coleção inteira — o defeito que o `CorruptSpecError`
    // foi criado para corrigir, reintroduzido deste lado.
    spec: value['spec'],
    folderId: value['folderId'],
    position: value['position'],
  }
}

const parseHeader = (value: unknown): ResponseHeader => {
  if (!isRecord(value) || typeof value['name'] !== 'string' || typeof value['value'] !== 'string') {
    throw wrongShape('um header')
  }
  return { name: value['name'], value: value['value'] }
}

const parseExecuted = (value: unknown): ExecutedResponse => {
  if (
    !isRecord(value) ||
    typeof value['status'] !== 'number' ||
    typeof value['body'] !== 'string' ||
    (value['encoding'] !== 'utf-8' && value['encoding'] !== 'base64') ||
    typeof value['truncated'] !== 'boolean' ||
    typeof value['timedOut'] !== 'boolean' ||
    typeof value['bytes'] !== 'number' ||
    typeof value['durationMs'] !== 'number' ||
    (value['contentLength'] !== null && typeof value['contentLength'] !== 'number')
  ) {
    throw wrongShape('uma execução')
  }
  return {
    status: value['status'],
    headers: list(value['headers'], 'os headers', parseHeader),
    body: value['body'],
    encoding: value['encoding'],
    truncated: value['truncated'],
    timedOut: value['timedOut'],
    bytes: value['bytes'],
    contentLength: value['contentLength'],
    durationMs: value['durationMs'],
  }
}

/**
 * Status de execução → o vocabulário da tela.
 *
 * Os quatro casos são quatro lugares para procurar o problema, e é por isso
 * que eles não podem chegar como uma frase só. `400` é o único ambíguo: ele
 * também responde a um `env` malformado, então o que decide é o payload trazer
 * `missing` — traduzir todo 400 para "falta variável" mandaria quem não tem
 * variável nenhuma caçar uma.
 */
const EXECUTION_FAILURES = { 422: 'refused', 502: 'unreachable', 504: 'timeout' } as const

export const httpRequestsClient = ({ config, fetch }: HttpRequestsClientDeps): RequestsPort => {
  const send = httpClient({ config, ...(fetch ? { fetch } : {}) })

  return {
    async folders() {
      return list(await send('/requests/folders'), 'as pastas', parseFolder)
    },

    async requests() {
      return list(await send('/requests'), 'as requests', parseRequest)
    },

    async saveFolder(folder) {
      return parseFolder(await send('/requests/folders', { method: 'POST', body: JSON.stringify(folder) }))
    },

    async saveRequest(request) {
      return parseRequest(await send('/requests', { method: 'POST', body: JSON.stringify(request) }))
    },

    async deleteRequest(id) {
      await send(`/requests/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },

    async execute(id, env) {
      try {
        const payload = await send(`/requests/${encodeURIComponent(id)}/execute`, {
          method: 'POST',
          body: JSON.stringify({ env }),
        })
        return parseExecuted(payload)
      } catch (error) {
        if (error instanceof ApiUnreachableError) {
          throw new ExecutionFailedError(
            'offline',
            'a API local deste app não respondeu — o alvo nem chegou a ser tentado',
          )
        }
        if (error instanceof ApiError) {
          const details = error.details
          if (error.status === 400 && isRecord(details) && Array.isArray(details['missing'])) {
            // Os dois campos passam pela **mesma** peneira. `missing` era
            // guardado e `surviving` não, então um `surviving: "x"` virava
            // `"x".filter is not a function` escapando do `catch` — e a tela
            // mostrava isso onde o C10 pede os nomes das variáveis.
            const names = (key: string): string[] => {
              const value = details[key]
              return Array.isArray(value)
                ? value.filter((name): name is string => typeof name === 'string')
                : []
            }
            throw new MissingVariablesError(names('missing'), names('surviving'), error.message)
          }

          const kind = EXECUTION_FAILURES[error.status as keyof typeof EXECUTION_FAILURES]
          if (kind) throw new ExecutionFailedError(kind, error.message)
        }
        throw error
      }
    },
  }
}
