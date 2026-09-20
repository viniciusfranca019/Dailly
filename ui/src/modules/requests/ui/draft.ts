import type { SavedRequest } from '@dailly/requests-core'
import {
  AmbiguousUrlError,
  MissingUrlError,
  NotACurlError,
  UnterminatedQuoteError,
  httpDriver,
  type HttpHeader,
  type HttpSpec,
} from '@dailly/requests-core/http'

/**
 * Os campos editáveis de uma request HTTP.
 *
 * É o `HttpSpec` afrouxado nos dois pontos em que um formulário difere de um
 * modelo: `body` é `''` e não `null`, porque um `<textarea>` não tem "nulo"; e
 * as listas são mutáveis, porque a pessoa acrescenta e remove linha.
 *
 * `auth.password` continua podendo ser `null`, e isso **não** é afrouxamento:
 * `null` quer dizer "o curl não trouxe dois-pontos", e é o que faz `-u
 * '{{credencial}}'` atravessar a interpolação inteiro em vez de virar usuário
 * `{{credencial}}` com senha vazia. Trocar por `''` aqui quebraria o caso no
 * caminho entre a tela e a fita.
 */
export interface Draft {
  name: string
  folderId: string | null
  method: string
  url: string
  headers: HttpHeader[]
  body: string
  query: string[]
  auth: { user: string; password: string | null } | null
}

export type Imported =
  | { readonly kind: 'imported'; readonly draft: Draft; readonly ignored: readonly string[] }
  | { readonly kind: 'rejected'; readonly reason: string }

const METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD'])

const draftFrom = (spec: HttpSpec, over: Partial<Draft> = {}): Draft => ({
  name: '',
  folderId: null,
  method: spec.method,
  url: spec.url,
  headers: spec.headers.map((header) => ({ ...header })),
  body: spec.body ?? '',
  query: [...spec.query],
  auth: spec.auth === null ? null : { ...spec.auth },
  ...over,
})

/**
 * Texto colado → campos preenchidos, ou a recusa com o motivo.
 *
 * As quatro recusas do importador viram frase aqui e não sobem como exceção:
 * quem colou um curl torto precisa ler o que faltou, e uma exceção atravessando
 * o componente vira "algo deu errado".
 */
export function importCurl(raw: string): Imported {
  try {
    const { spec, ignored } = httpDriver.fromRaw(raw)
    return { kind: 'imported', draft: draftFrom(spec), ignored }
  } catch (error) {
    if (
      error instanceof NotACurlError ||
      error instanceof MissingUrlError ||
      error instanceof AmbiguousUrlError ||
      error instanceof UnterminatedQuoteError
    ) {
      return { kind: 'rejected', reason: error.message }
    }
    throw error
  }
}

/**
 * Uma request salva → os campos, ou `null` quando ela não é legível.
 *
 * `null` é o caso que o servidor cria de propósito: uma request com `spec`
 * corrompido é listada para poder ser **apagada**. Estourar aqui tiraria da
 * tela a única coisa que ela ainda pode fazer com ela.
 */
export function draftOf(request: SavedRequest): Draft | null {
  if (request.protocol !== 'http') return null
  const validated = httpDriver.validate(request.spec)
  if ('errors' in validated) return null
  return draftFrom(validated.spec, { name: request.name, folderId: request.folderId })
}

/**
 * Os campos → a request a gravar, ou `null` quando eles não formam uma.
 *
 * A validação é a do **driver**, não uma cópia: é ela que o servidor vai
 * aplicar de novo antes de executar, e duas validações escritas em dois
 * lugares divergem no dia em que uma das duas mudar.
 *
 * A `query` do `-G` continua separada da URL, como o B1 a deixou. Colá-la aqui
 * exigiria escolher entre `?` e `&` olhando um texto que pode ser
 * `{{baseUrl}}` — é o `toWire` que faz isso, depois da interpolação.
 */
export function savedOf(
  draft: Draft,
  where: { id: string; position: number },
): SavedRequest | null {
  const spec = {
    method: draft.method.trim().toUpperCase(),
    url: draft.url.trim(),
    headers: draft.headers.filter((header) => header.name.trim() !== ''),
    // Um corpo vazio num GET é ausência de corpo, não um corpo de zero byte —
    // e mandar `Content-Length: 0` onde o curl não mandava muda a requisição.
    body: draft.body === '' || METHODS_WITHOUT_BODY.has(draft.method.trim().toUpperCase())
      ? null
      : draft.body,
    query: draft.query,
    auth: draft.auth === null || draft.auth.user.trim() === '' ? null : draft.auth,
  }

  const validated = httpDriver.validate(spec)
  if ('errors' in validated) return null

  return {
    id: where.id,
    name: draft.name.trim() === '' ? spec.url : draft.name.trim(),
    protocol: 'http',
    spec: validated.spec,
    folderId: draft.folderId,
    position: where.position,
  }
}
