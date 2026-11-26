import { afterAll, describe, expect, it } from 'vitest'
import { createDaillyMcp } from '../mcp/src/server.js'
import { connected } from '../mcp/src/testing.js'
import { createServer, type RunningServer } from '../server/src/index.js'

/**
 * programa-comentarios C6: the next session of a program finds it and reads
 * its comments through the MCP, a client of the real API over a real socket.
 */
const running: RunningServer[] = []
afterAll(async () => {
  await Promise.all(running.map((server) => server.close()))
})

/** "Dailly v1", made through the API itself, with the comment "ele vem quinta". */
async function harness() {
  const server = await createServer({ databaseFile: ':memory:' })
  running.push(server)
  const post = (path: string, body: unknown) =>
    fetch(`${server.url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(
      (response) => response.json() as Promise<{ id: string }>,
    )
  const dailly = await post('/programs', { name: 'Dailly v1', objective: 'fechar a v1' })
  await post(`/programs/${dailly.id}/comments`, { body: 'ele vem quinta' })
  const mcp = await connected(createDaillyMcp({ apiUrl: server.url }))
  return { mcp, dailly: dailly.id }
}

describe('C6: A próxima sessão lê pelo MCP', () => {
  it('list_programs dá "Dailly v1" com o id, e list_program_comments com ele traz "ele vem quinta" com a data', async () => {
    const { mcp, dailly } = await harness()

    const programs = (await mcp.call('list_programs')).ok as { id: string; name: string }[]
    expect(programs).toEqual([expect.objectContaining({ id: dailly, name: 'Dailly v1', objective: 'fechar a v1', focus: null })])

    expect((await mcp.call('list_program_comments', { program: dailly })).ok).toEqual([
      { id: expect.any(String), body: 'ele vem quinta', createdAt: expect.any(String) },
    ])
  })

  it('add_program_comment comenta e delete_program_comment apaga', async () => {
    const { mcp, dailly } = await harness()

    const added = (await mcp.call('add_program_comment', { program: dailly, body: 'a lixa acabou' })).ok as { id: string; body: string }
    expect(added.body).toBe('a lixa acabou')
    expect((await mcp.call('delete_program_comment', { program: dailly, id: added.id })).ok).toEqual({ deleted: added.id })
    expect(((await mcp.call('list_program_comments', { program: dailly })).ok as { body: string }[]).map((one) => one.body)).toEqual([
      'ele vem quinta',
    ])
  })

  it('um programa que não existe é erro da tool que diz "programa não encontrado"', async () => {
    const { mcp } = await harness()

    for (const call of [
      mcp.call('list_program_comments', { program: 'nope' }),
      mcp.call('add_program_comment', { program: 'nope', body: 'x' }),
      mcp.call('delete_program_comment', { program: 'nope', id: 'x' }),
    ]) {
      expect((await call).error).toContain('programa não encontrado')
    }
  })

  it('um comentário vazio é erro da tool com "o comentário é obrigatório"', async () => {
    const { mcp, dailly } = await harness()

    expect((await mcp.call('add_program_comment', { program: dailly, body: '   ' })).error).toContain('o comentário é obrigatório')
  })
})
