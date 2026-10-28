/**
 * Where the API is, and how to prove we are allowed to talk to it.
 *
 * Since ADR 0012 there is one answer: the renderer is served by vite (`make dev`,
 * `make start`), which proxies `/api` to the API on its fixed port. So the
 * renderer never holds an absolute URL and there is no CORS to configure.
 *
 * `token` stays in the shape because the server still accepts one and the
 * end-to-end test exercises it over the wire. Nothing in the app produces one
 * today: that was the Electron main process, and ADR 0012 records the open
 * question of whether a hosted version brings it back.
 */
export interface ApiConfig {
  readonly baseUrl: string
  readonly token?: string
}

export const API_CONFIG: ApiConfig = { baseUrl: '/api' }
