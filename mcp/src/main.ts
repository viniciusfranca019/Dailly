/**
 * The entry point Claude Code starts (`.mcp.json`, `make mcp`): the server on
 * stdio, talking to the API at `DAILLY_API_URL`, by default the real diary of
 * `make start` (card #57, P3 A). The API has to be up; a tool says so when not.
 *
 * Nothing is written to stdout here but the protocol: a log line would corrupt it.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createDaillyMcp } from './server.js'

const apiUrl = process.env['DAILLY_API_URL'] ?? 'http://127.0.0.1:4318'
await createDaillyMcp({ apiUrl }).connect(new StdioServerTransport())
console.error(`dailly mcp: API em ${apiUrl}`)
