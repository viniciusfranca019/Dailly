import { afterAll, describe, expect, it } from 'vitest'
import { createDaillyMcp } from '../mcp/src/server.js'
import { connected } from '../mcp/src/testing.js'
import { createServer, type RunningServer } from '../server/src/index.js'

/**
 * Card #57: the harness operates the Tasks through the MCP, which is a client
 * of the real API over a real socket. A field renamed on either side breaks
 * here, which is what keeps the MCP's own HTTP client honest.
 */
const running: RunningServer[] = []
afterAll(async () => {
  await Promise.all(running.map((server) => server.close()))
})

async function harness() {
  const server = await createServer({ databaseFile: ':memory:' })
  running.push(server)
  const mcp = await connected(createDaillyMcp({ apiUrl: server.url }))
  return { server, mcp }
}

/** The board "Casa" with CASA-1 "Lixar a parede" in "A fazer", made through the API itself. */
async function withCasa(apiUrl: string): Promise<string> {
  const post = (path: string, body: unknown) =>
    fetch(`${apiUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(
      (response) => response.json() as Promise<Record<string, unknown>>,
    )
  const casa = (await post('/boards', { name: 'Casa', prefix: 'CASA' })) as { id: string }
  const board = (await (await fetch(`${apiUrl}/tasks?boardId=${casa.id}`)).json()) as { statuses: { id: string; name: string }[] }
  const todo = board.statuses.find((status) => status.name === 'A fazer')!.id
  await post('/tasks', { boardId: casa.id, title: 'Lixar a parede', statusId: todo })
  return casa.id
}

type Board = {
  board: { name: string; prefix: string }
  statuses: { name: string }[]
  tasks: { key: string; title: string; status: string; priority: string; completedAt: string | null }[]
}

describe('C1: Ler um board', () => {
  it('get_board("Casa") devolve os status e CASA-1 em "A fazer", com a prioridade', async () => {
    const { server, mcp } = await harness()
    await withCasa(server.url)

    const read = (await mcp.call('get_board', { board: 'casa' })).ok as Board

    expect(read.board).toMatchObject({ name: 'Casa', prefix: 'CASA' })
    expect(read.statuses.map((status) => status.name)).toEqual(['Backlog', 'A fazer', 'Fazendo', 'Feito', 'Cancelado'])
    expect(read.tasks).toEqual([expect.objectContaining({ key: 'CASA-1', title: 'Lixar a parede', status: 'A fazer', priority: 'sem' })])
  })

  it('list_boards dá os boards, e um board que não existe é um erro que diz o nome', async () => {
    const { server, mcp } = await harness()
    await withCasa(server.url)

    expect(((await mcp.call('list_boards')).ok as { name: string }[]).map((board) => board.name)).toEqual(['Tasks', 'Casa'])
    expect((await mcp.call('get_board', { board: 'Garagem' })).error).toContain('Garagem')
  })
})

describe('C2: Criar tarefa', () => {
  it('create_task cria CASA-2 no topo de "A fazer", com "alta"', async () => {
    const { server, mcp } = await harness()
    await withCasa(server.url)

    const created = (await mcp.call('create_task', { board: 'Casa', title: 'Comprar tinta', status: 'A fazer', priority: 'alta' }))
      .ok as { key: string; priority: string }

    expect(created).toMatchObject({ key: 'CASA-2', priority: 'alta' })
    const read = (await mcp.call('get_board', { board: 'Casa' })).ok as Board
    expect(read.tasks.map((task) => [task.key, task.status, task.priority])).toEqual([
      ['CASA-2', 'A fazer', 'alta'],
      ['CASA-1', 'A fazer', 'sem'],
    ])
  })

  it('sem board nem status, cria no "Tasks", no primeiro "a fazer", e search_tasks a acha', async () => {
    const { mcp } = await harness()

    expect((await mcp.call('create_task', { title: 'Pagar o condomínio' })).ok).toMatchObject({ key: 'T-1', status: 'A fazer' })
    expect((await mcp.call('search_tasks', { text: 'condomínio' })).ok).toEqual([
      expect.objectContaining({ key: 'T-1', title: 'Pagar o condomínio', board: 'Tasks' }),
    ])
  })
})

describe('C3: Mover de status', () => {
  it('update_task(CASA-2, "Feito") põe no topo de "Feito", com a conclusão carimbada (RN3)', async () => {
    const { server, mcp } = await harness()
    await withCasa(server.url)
    await mcp.call('create_task', { board: 'Casa', title: 'Comprar tinta' })
    await mcp.call('update_task', { key: 'CASA-1', status: 'Feito' })

    const moved = (await mcp.call('update_task', { key: 'casa-2', status: 'feito' })).ok as Board['tasks'][number]

    expect(moved).toMatchObject({ key: 'CASA-2', status: 'Feito', completedAt: expect.any(String) })
    const read = (await mcp.call('get_board', { board: 'Casa' })).ok as Board
    expect(read.tasks.filter((task) => task.status === 'Feito').map((task) => task.key)).toEqual(['CASA-2', 'CASA-1'])
  })

  it('muda título, corpo e prioridade numa gravação, e apaga a tarefa', async () => {
    const { server, mcp } = await harness()
    await withCasa(server.url)

    expect((await mcp.call('update_task', { key: 'CASA-1', title: 'Lixar e pintar', body: 'usar a lixa **120**', priority: 'urgente' })).ok).toMatchObject({
      title: 'Lixar e pintar',
      body: 'usar a lixa **120**',
      priority: 'urgente',
    })
    expect((await mcp.call('delete_task', { key: 'CASA-1' })).ok).toEqual({ deleted: 'CASA-1' })
    expect((await mcp.call('get_board', { board: 'Casa' })).ok).toMatchObject({ tasks: [] })
    expect((await mcp.call('delete_task', { key: 'CASA-1' })).error).toContain('CASA-1')
  })

  it('comenta, lê e apaga o comentário', async () => {
    const { server, mcp } = await harness()
    await withCasa(server.url)

    const comment = (await mcp.call('add_comment', { key: 'CASA-1', body: 'a lixa acabou' })).ok as { id: string }
    expect((await mcp.call('list_comments', { key: 'CASA-1' })).ok).toEqual([expect.objectContaining({ body: 'a lixa acabou' })])
    expect((await mcp.call('delete_comment', { key: 'CASA-1', id: comment.id })).ok).toEqual({ deleted: comment.id })
    expect((await mcp.call('list_comments', { key: 'CASA-1' })).ok).toEqual([])
  })
})

describe('C4: Recusa da API vira erro da tool', () => {
  it('create_task com o título vazio falha com "o título é obrigatório", e nada é criado', async () => {
    const { server, mcp } = await harness()
    await withCasa(server.url)

    expect((await mcp.call('create_task', { board: 'Casa', title: '   ' })).error).toContain('o título é obrigatório')
    expect(((await mcp.call('get_board', { board: 'Casa' })).ok as Board).tasks).toHaveLength(1)
  })
})
