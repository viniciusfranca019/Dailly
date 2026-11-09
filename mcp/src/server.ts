import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { apiClient } from './api.js'
import { registerTaskTools } from './tasks.js'

/**
 * The dailly MCP server (card #57): a third client of the local API, next to
 * `ui/`, for the harness to operate the modules. It imports `packages/` only,
 * and runs the same rules the screen runs (the move's rank, here).
 *
 * The Requests and the vault are not here, on purpose: the owner left the
 * Requests for later, and the vault holds secrets.
 */
export interface DaillyMcpDeps {
  /** `http://127.0.0.1:4318` is the real diary (`make start`); `:4317`, the dev one. */
  readonly apiUrl: string
  readonly fetch?: typeof fetch
}

export function createDaillyMcp({ apiUrl, fetch }: DaillyMcpDeps): McpServer {
  const server = new McpServer({ name: 'dailly', version: '0.1.0' })
  const api = apiClient(apiUrl, fetch)
  registerTaskTools(server, api)
  return server
}
