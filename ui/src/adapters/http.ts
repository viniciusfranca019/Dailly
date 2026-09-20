import type { ApiConfig } from './api.js'
import { ApiError, ApiUnreachableError } from './errors.js'

export interface HttpClientDeps {
  readonly config: ApiConfig
  readonly fetch?: typeof globalThis.fetch
}

/**
 * Uma chamada à API local, com as decisões que valem para **todas** elas.
 *
 * Extraído quando ganhou o segundo chamador, e não antes: o `Authorization`,
 * o `content-type`, o 204 sem corpo e a diferença entre "o servidor recusou"
 * e "ninguém atendeu" estavam dentro do repositório de entries. Duplicá-los
 * significaria que esquecer o token num dos dois faria toda execução responder
 * 401 — e o defeito estaria num arquivo enquanto a causa mora no outro.
 *
 * O que **não** está aqui é a tradução de status para o vocabulário de cada
 * domínio: `501` vira `NotImplementedError` nas entries e `504` vira "o prazo
 * estourou" nas requests. Isso é do chamador, e subir para cá faria este
 * arquivo conhecer os dois domínios.
 */
export function httpClient({
  config,
  fetch: doFetch = globalThis.fetch.bind(globalThis),
}: HttpClientDeps): (path: string, init?: RequestInit) => Promise<unknown> {
  return async (path, init = {}) => {
    let response: Response
    try {
      response = await doFetch(`${config.baseUrl}${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
          ...init.headers,
        },
      })
    } catch (cause) {
      // Um fetch rejeitado é a rede, não o servidor: não há status a relatar.
      throw new ApiUnreachableError(cause)
    }

    /**
     * Ler o corpo tem a sua própria falha, e ela não é "ninguém atendeu".
     *
     * O proxy do vite devolve HTML num 502. Com o `json()` fora deste `try`, o
     * `SyntaxError` escapava sem ser `ApiError` nem `ApiUnreachableError` — e
     * quem chamasse traduzia o que sobrasse, então a tela mostrava "Unexpected
     * token <" onde devia dizer que o alvo não atendeu.
     *
     * O 204 não chega aqui de propósito: `Response.json()` num corpo vazio
     * estoura, e chamar para descartar seria pedir o erro que este ramo evita.
     */
    let payload: unknown
    try {
      payload = response.status === 204 ? undefined : await response.json()
    } catch {
      throw new ApiError(
        response.status,
        `a API respondeu ${response.status} com um corpo que não é JSON`,
      )
    }

    if (!response.ok) throw new ApiError(response.status, describeRefusal(payload), payload)
    return payload
  }
}

/** Tira uma mensagem legível de qualquer coisa que a API tenha mandado. */
export function describeRefusal(payload: unknown): string {
  if (typeof payload === 'object' && payload !== null) {
    const body = payload as { error?: unknown; errors?: { field?: string; message?: string }[] }
    if (typeof body.error === 'string') return body.error
    if (Array.isArray(body.errors)) {
      return body.errors
        .map((error) => [error.field, error.message].filter(Boolean).join(' '))
        .join('; ')
    }
  }
  return 'a API recusou a requisição'
}
