/**
 * Where the API is, and how to prove we are allowed to talk to it.
 *
 * The two environments answer differently on purpose:
 *
 * - **dev** — a fixed port, reached through vite's `/api` proxy, so the
 *   renderer never holds an absolute URL and there is no CORS to configure.
 * - **production** — an ephemeral port chosen at boot and a token generated per
 *   run, both handed over by the Electron main process through `contextBridge`
 *   (ADR 0008). Never a query string: a token in a URL lands in history and
 *   logs.
 *
 * Both paths produce this one object, which is all the rest of the renderer
 * knows about the subject.
 */
export interface ApiConfig {
  readonly baseUrl: string
  readonly token?: string
}

/** What the preload script exposes, when there is one. */
interface DaillyBridge {
  readonly api?: ApiConfig
}

export function resolveApiConfig(): ApiConfig {
  const bridge = (globalThis as { dailly?: DaillyBridge }).dailly
  // The shell is authoritative when present; `/api` is the dev fallback.
  return bridge?.api ?? { baseUrl: '/api' }
}
