import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

/** A tool's answer: its JSON as text, the one content every MCP client reads. A failure is a thrown `Error`, which the SDK turns into `isError`. */
export const answer = (value: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
})
