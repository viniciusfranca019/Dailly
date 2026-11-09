/**
 * The MCP's client of the local API: one call, with the two failures a tool
 * has to tell apart, "nobody answered" and "the API said no".
 *
 * Its own, and not the `ui/` adapters: the arrows keep `ui/` out of reach
 * (card #57, P1 A). `e2e/mcp-tasks.test.ts` runs it against the real Fastify,
 * so a field renamed on either side fails there, as the `ui/` round trips do.
 */

/** The API answered, and the answer was a refusal; `status` lets a tool say "não encontrada". */
export class ApiRefusal extends Error {
  override readonly name = 'ApiRefusal'
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export type Api = (path: string, init?: { method?: string; body?: unknown }) => Promise<unknown>

export function apiClient(baseUrl: string, doFetch: typeof fetch = globalThis.fetch.bind(globalThis)): Api {
  const base = baseUrl.replace(/\/+$/, '')
  return async (path, { method = 'GET', body } = {}) => {
    let response: Response
    try {
      response = await doFetch(`${base}${path}`, {
        method,
        // Only with a body: Fastify refuses an empty JSON body (the `ui/` learned it on DELETE).
        ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      })
    } catch {
      throw new Error(`não consegui falar com a API local em ${base}`)
    }
    if (response.status === 204) return undefined
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new ApiRefusal(response.status, `a API respondeu ${response.status} com um corpo que não é JSON`)
    }
    if (!response.ok) throw new ApiRefusal(response.status, refusal(payload, response.status))
    return payload
  }
}

/** The API's own words: `{error}` or `{errors: [{message}]}`. */
function refusal(payload: unknown, status: number): string {
  if (typeof payload === 'object' && payload !== null) {
    const body = payload as { error?: unknown; errors?: unknown }
    if (typeof body.error === 'string') return body.error
    if (Array.isArray(body.errors)) {
      const said = body.errors
        .map((error) => (typeof error === 'object' && error !== null ? (error as { message?: unknown }).message : undefined))
        .filter((message): message is string => typeof message === 'string' && message !== '')
      if (said.length > 0) return said.join('; ')
    }
  }
  return `a API recusou a requisição (${status})`
}
