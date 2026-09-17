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
  apiConfig?: () => Promise<ApiConfig>
}

/**
 * Async because the shell hands the token over on request, through IPC, rather
 * than leaving it somewhere the renderer could read synchronously — which in
 * practice would mean `process.argv` or a URL, and both are readable by other
 * processes on this machine.
 */
export async function resolveApiConfig(): Promise<ApiConfig> {
  const bridge = (globalThis as { dailly?: DaillyBridge }).dailly
  try {
    // The shell is authoritative when present; `/api` is the dev fallback, where
    // vite proxies to the API on its fixed port and there is no token at all.
    return (await bridge?.apiConfig?.()) ?? { baseUrl: '/api' }
  } catch {
    // A preload that loaded but whose IPC failed must not take the whole app
    // down with it. Falling back leaves the screen up and lets the first
    // request fail visibly, which is a error someone can read.
    return { baseUrl: '/api' }
  }
}
