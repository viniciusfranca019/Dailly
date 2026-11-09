import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

/**
 * A harness for the tests: the MCP server connected to a real MCP client in
 * memory, so a test calls a tool the way Claude Code does, by name and JSON.
 */
export async function connected(server: McpServer) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'dailly-test', version: '0.0.0' })
  await Promise.all([server.connect(serverSide), client.connect(clientSide)])

  /** The tool's answer: its JSON when it worked, its message when it failed. */
  async function call(name: string, args: Record<string, unknown> = {}) {
    const result = await client.callTool({ name, arguments: args })
    const text = (result.content as { type: string; text?: string }[]).map((part) => part.text ?? '').join('')
    return result.isError ? { error: text } : { ok: JSON.parse(text) as unknown }
  }

  return {
    call,
    tools: async () => (await client.listTools()).tools,
    close: () => client.close(),
  }
}
