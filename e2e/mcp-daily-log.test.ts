import { afterAll, describe, expect, it } from 'vitest'
import { createDaillyMcp } from '../mcp/src/server.js'
import { connected } from '../mcp/src/testing.js'
import { createServer, type RunningServer } from '../server/src/index.js'

/**
 * Card #58: the harness writes the Daily Log through the MCP, which runs the
 * same use-cases the screen runs (`createEntry`, `updateEntry`) against the
 * real API. "Today" is the API's zone.
 */
const running: RunningServer[] = []
afterAll(async () => {
  await Promise.all(running.map((server) => server.close()))
})

async function harness() {
  const server = await createServer({ databaseFile: ':memory:', zone: 'America/Sao_Paulo' })
  running.push(server)
  return { server, mcp: await connected(createDaillyMcp({ apiUrl: server.url })) }
}

type EntryView = { id: string; body: string; day: string; time: string; labels: string[] }
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

describe('C5: Registrar no Daily Log', () => {
  it('create_entry entra na timeline de hoje, com o corpo normalizado e a label "trabalho"', async () => {
    const { mcp } = await harness()
    await mcp.call('create_label', { name: 'Trabalho' })

    const created = (await mcp.call('create_entry', { body: 'Reunião com o banco\n\n\n* levar o extrato', labels: ['trabalho'] })).ok as EntryView

    expect(created).toMatchObject({ body: 'Reunião com o banco\n- levar o extrato', day: today(), labels: ['Trabalho'] })
    expect(((await mcp.call('list_entries')).ok as EntryView[]).map((entry) => entry.id)).toEqual([created.id])
    expect((await mcp.call('get_entry', { id: created.id })).ok).toMatchObject({ id: created.id, labels: ['Trabalho'] })
  })

  it('uma label que não existe é recusada pelo nome, e nada é gravado; o corpo vazio também', async () => {
    const { mcp } = await harness()

    expect((await mcp.call('create_entry', { body: 'x', labels: ['saúde'] })).error).toContain('"saúde"')
    expect((await mcp.call('create_entry', { body: '   \n' })).error).toBeDefined()
    expect((await mcp.call('list_entries')).ok).toEqual([])
  })

  it('list_entries filtra por período e por label, e list_labels dá as labels com a cor', async () => {
    const { mcp } = await harness()
    await mcp.call('create_label', { name: 'Casa' })
    await mcp.call('create_entry', { body: 'Ontem, na casa', occurredAt: '2026-11-08T15:00:00.000Z', labels: ['casa'] })
    await mcp.call('create_entry', { body: 'Hoje, no trabalho' })

    const yesterday = (await mcp.call('list_entries', { from: '2026-11-08', to: '2026-11-08' })).ok as EntryView[]
    expect(yesterday.map((entry) => [entry.body, entry.day])).toEqual([['Ontem, na casa', '2026-11-08']])
    expect(((await mcp.call('list_entries', { from: '2026-11-01', to: today(), labels: ['Casa'] })).ok as EntryView[]).map((entry) => entry.body)).toEqual([
      'Ontem, na casa',
    ])
    expect((await mcp.call('list_labels')).ok).toEqual([expect.objectContaining({ name: 'Casa', color: expect.any(String) })])
    expect((await mcp.call('create_label', { name: 'casa' })).error).toBeDefined()
  })
})

describe('C6: Corrigir e apagar um registro', () => {
  it('update_entry corrige o texto, e delete_entry o tira da timeline', async () => {
    const { mcp } = await harness()
    const created = (await mcp.call('create_entry', { body: 'Reuniao com o banco' })).ok as EntryView

    expect((await mcp.call('update_entry', { id: created.id, body: 'Reunião com o banco, adiada' })).ok).toMatchObject({ body: 'Reunião com o banco, adiada' })
    expect(((await mcp.call('list_entries')).ok as EntryView[]).map((entry) => entry.body)).toEqual(['Reunião com o banco, adiada'])

    expect((await mcp.call('delete_entry', { id: created.id })).ok).toEqual({ deleted: created.id })
    expect((await mcp.call('list_entries')).ok).toEqual([])
    expect((await mcp.call('delete_entry', { id: created.id })).error).toContain(created.id)
  })

  it('update_entry só com labels mantém o texto', async () => {
    const { mcp } = await harness()
    await mcp.call('create_label', { name: 'Saúde' })
    const created = (await mcp.call('create_entry', { body: 'Corri 5 km' })).ok as EntryView

    expect((await mcp.call('update_entry', { id: created.id, labels: ['saúde'] })).ok).toMatchObject({ body: 'Corri 5 km', labels: ['Saúde'] })
  })
})

describe('#58: labels nas tarefas, pelo nome', () => {
  it('update_task põe e tira labels sem apagar as outras', async () => {
    const { mcp } = await harness()
    for (const name of ['Casa', 'Urgente']) await mcp.call('create_label', { name })
    await mcp.call('create_task', { title: 'Trocar a lâmpada' })

    await mcp.call('update_task', { key: 'T-1', addLabels: ['casa', 'urgente'] })
    const after = (await mcp.call('update_task', { key: 'T-1', removeLabels: ['Urgente'] })).ok as { labels: string[] }

    expect(after.labels).toEqual(['Casa'])
    expect((await mcp.call('update_task', { key: 'T-1', addLabels: ['garagem'] })).error).toContain('"garagem"')
  })
})
