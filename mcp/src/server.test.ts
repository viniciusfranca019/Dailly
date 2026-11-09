import { describe, expect, it } from 'vitest'
import { createDaillyMcp } from './server.js'
import { connected } from './testing.js'

/** Card #57, what holds with no API at all: C7 and C8. The rest runs against the real API in `e2e/mcp-tasks.test.ts`. */
describe('C7: API fora', () => {
  it('a tool falha dizendo a URL, e o servidor MCP continua atendendo', async () => {
    // A port nobody listens on: the connection is refused at once.
    const mcp = await connected(createDaillyMcp({ apiUrl: 'http://127.0.0.1:9' }))

    expect((await mcp.call('list_boards')).error).toBe('não consegui falar com a API local em http://127.0.0.1:9')
    expect((await mcp.call('get_board', { board: 'Casa' })).error).toContain('não consegui falar com a API local')
    expect((await mcp.tools()).length).toBeGreaterThan(0)
  })
})

describe('C8: Requests não aparece', () => {
  it('lista as tools do Tasks, e nenhuma do Requests nem do cofre', async () => {
    const mcp = await connected(createDaillyMcp({ apiUrl: 'http://127.0.0.1:9' }))
    const names = (await mcp.tools()).map((tool) => tool.name)

    expect(names).toEqual(
      expect.arrayContaining([
        'list_boards',
        'get_board',
        'search_tasks',
        'create_task',
        'update_task',
        'delete_task',
        'list_comments',
        'add_comment',
        'delete_comment',
      ]),
    )
    expect(names.filter((name) => /request|secret|vault|cofre/i.test(name))).toEqual([])
  })

  it('o que apaga é marcado destrutivo, e o que só lê, só leitura', async () => {
    const mcp = await connected(createDaillyMcp({ apiUrl: 'http://127.0.0.1:9' }))
    const tools = Object.fromEntries((await mcp.tools()).map((tool) => [tool.name, tool.annotations]))

    expect(tools['delete_task']?.destructiveHint).toBe(true)
    expect(tools['delete_comment']?.destructiveHint).toBe(true)
    expect(tools['get_board']?.readOnlyHint).toBe(true)
    expect(tools['create_task']?.destructiveHint).toBe(false)
  })
})
