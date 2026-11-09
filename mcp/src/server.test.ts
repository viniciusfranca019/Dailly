import { createServer, type Server } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
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

describe('gate #57: C7 com a API presa, que aceita a conexão e não responde', () => {
  let silent: Server | undefined
  afterEach(() => silent?.close())

  it('a tool falha no prazo, com a mesma mensagem, em vez de esperar minutos', async () => {
    const sockets: import('node:net').Socket[] = []
    silent = createServer((socket) => sockets.push(socket))
    await new Promise<void>((resolve) => silent!.listen(0, '127.0.0.1', resolve))
    const { port } = silent.address() as { port: number }
    const mcp = await connected(createDaillyMcp({ apiUrl: `http://127.0.0.1:${port}`, timeoutMs: 200 }))

    const started = performance.now()
    expect((await mcp.call('list_boards')).error).toBe(`não consegui falar com a API local em http://127.0.0.1:${port}`)
    expect(performance.now() - started).toBeLessThan(2000)
    for (const socket of sockets) socket.destroy()
  })
})

describe('gate #57: labels nas tarefas são do card #58', () => {
  it('update_task não aceita labelIds', async () => {
    const mcp = await connected(createDaillyMcp({ apiUrl: 'http://127.0.0.1:9' }))
    const update = (await mcp.tools()).find((tool) => tool.name === 'update_task')!

    expect(Object.keys(update.inputSchema.properties ?? {})).not.toContain('labelIds')
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
        'list_entries',
        'get_entry',
        'create_entry',
        'update_entry',
        'delete_entry',
        'list_labels',
        'create_label',
      ]),
    )
    expect(names.filter((name) => /request|secret|vault|cofre/i.test(name))).toEqual([])
  })

  it('o que apaga é marcado destrutivo, e o que só lê, só leitura', async () => {
    const mcp = await connected(createDaillyMcp({ apiUrl: 'http://127.0.0.1:9' }))
    const tools = Object.fromEntries((await mcp.tools()).map((tool) => [tool.name, tool.annotations]))

    expect(tools['delete_task']?.destructiveHint).toBe(true)
    expect(tools['delete_comment']?.destructiveHint).toBe(true)
    expect(tools['delete_entry']?.destructiveHint).toBe(true)
    expect(tools['list_entries']?.readOnlyHint).toBe(true)
    expect(tools['get_board']?.readOnlyHint).toBe(true)
    expect(tools['create_task']?.destructiveHint).toBe(false)
  })
})
