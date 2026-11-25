import { UTC } from '@dailly/periods'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './shell/app.js'
import { openDatabase } from './shell/database.js'

/**
 * Programs and focus over HTTP (LAB-9), with the real manifest and a real
 * SQLite. At the root of `src/` because it builds the whole app.
 */
let app: ReturnType<typeof buildApp>

beforeEach(() => {
  app = buildApp({ db: openDatabase(':memory:'), zone: UTC })
})

const send = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) =>
  app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as object }) })

/** Boards Labs (LAB-1..5) and VDT (VDT-1..2), and the program "Dailly v1". */
async function world() {
  const board = async (name: string, prefix: string, count: number) => {
    const created = (await send('POST', '/boards', { name, prefix })).json()
    const statusId = (await send('GET', `/tasks?boardId=${created.id}`)).json().statuses[1].id
    for (let n = 1; n <= count; n += 1) await send('POST', '/tasks', { boardId: created.id, title: `${prefix} ${n}`, statusId })
    return created
  }
  await board('Labs', 'LAB', 5)
  await board('VDT', 'VDT', 2)
  const dailly = (
    await send('POST', '/programs', {
      name: 'Dailly v1',
      objective: 'fechar a v1',
      windowStart: '2026-11-25',
      windowEnd: '2026-12-19',
      exitWhen: 'os cards dailly v1 em Done',
    })
  ).json()
  return { dailly }
}

describe('POST /programs', () => {
  it('C1: answers 201 with the program, listed with no task and out of focus', async () => {
    const { dailly } = await world()

    expect(dailly).toMatchObject({ name: 'Dailly v1', windowStart: '2026-11-25', windowEnd: '2026-12-19', focus: null })
    expect((await send('GET', '/programs')).json()).toEqual([{ ...dailly, tasks: [] }])
  })

  it('C2: refuses a window that ends before it starts with 400 on windowEnd, and creates nothing', async () => {
    const response = await send('POST', '/programs', { name: 'x', windowStart: '2026-12-19', windowEnd: '2026-11-25' })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ errors: [{ field: 'windowEnd', message: 'o fim da janela vem depois do início' }] })
    expect((await send('GET', '/programs')).json()).toEqual([])
  })

  it('refuses an empty name, a bad date and a body of the wrong shape with 400', async () => {
    expect((await send('POST', '/programs', { name: ' ' })).json()).toEqual({
      errors: [{ field: 'name', message: 'o nome é obrigatório' }],
    })
    expect((await send('POST', '/programs', { name: 'x', windowStart: '25/11' })).statusCode).toBe(400)
    expect((await send('POST', '/programs', { name: 'x', objective: 3 })).statusCode).toBe(400)
    expect((await send('POST', '/programs', [])).statusCode).toBe(400)
  })
})

describe('POST /programs/:id/tasks', () => {
  it('C3: tasks of different boards join, and each task says its program', async () => {
    const { dailly } = await world()

    await send('POST', `/programs/${dailly.id}/tasks`, { key: 'LAB-5' })
    const response = await send('POST', `/programs/${dailly.id}/tasks`, { key: 'vdt-2' })

    expect(response.statusCode).toBe(200)
    expect(response.json().tasks.map((task: { key: string }) => task.key)).toEqual(['LAB-5', 'VDT-2'])
    expect((await send('GET', '/tasks/LAB-5/program')).json()).toMatchObject({ program: { name: 'Dailly v1' } })
    expect((await send('GET', '/tasks/LAB-1/program')).json()).toEqual({ program: null })
  })

  it('C4: a task already in another program is refused with 409, naming both', async () => {
    const { dailly } = await world()
    const other = (await send('POST', '/programs', { name: 'Outro' })).json()
    await send('POST', `/programs/${dailly.id}/tasks`, { key: 'LAB-5' })

    const response = await send('POST', `/programs/${other.id}/tasks`, { key: 'LAB-5' })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({ error: 'LAB-5 já está no programa Dailly v1' })
  })

  it('answers 404 for a program or a task that does not exist, and 400 for a key of the wrong shape', async () => {
    const { dailly } = await world()
    expect((await send('POST', '/programs/nope/tasks', { key: 'LAB-5' })).statusCode).toBe(404)
    expect((await send('POST', `/programs/${dailly.id}/tasks`, { key: 'LAB-99' })).json()).toEqual({
      error: 'tarefa não encontrada',
    })
    expect((await send('POST', `/programs/${dailly.id}/tasks`, { key: 'lixo' })).statusCode).toBe(400)
    expect((await send('GET', '/tasks/LAB-99/program')).statusCode).toBe(404)
  })
})

describe('PUT /focus', () => {
  it('C5: a program and a task with no program go into focus, and the program\'s task inherits it', async () => {
    const { dailly } = await world()
    await send('POST', `/programs/${dailly.id}/tasks`, { key: 'LAB-5' })

    expect((await send('PUT', '/focus', { program: dailly.id, level: 'P0' })).statusCode).toBe(204)
    expect((await send('PUT', '/focus', { task: 'LAB-1', level: 'P1' })).statusCode).toBe(204)

    expect((await send('GET', '/focus')).json()).toEqual({
      P0: [{ kind: 'program', id: dailly.id, name: 'Dailly v1' }],
      P1: [{ kind: 'task', key: 'LAB-1', title: 'LAB 1' }],
      P2: [],
    })
    expect((await send('GET', '/tasks/LAB-5/program')).json().program.focus).toBe('P0')
  })

  it('C6: a task of a program is refused with 409', async () => {
    const { dailly } = await world()
    await send('POST', `/programs/${dailly.id}/tasks`, { key: 'LAB-5' })

    const response = await send('PUT', '/focus', { task: 'LAB-5', level: 'P0' })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({ error: 'LAB-5 é do programa Dailly v1: ponha o programa em foco' })
  })

  it('C7: level null takes it out of focus, and the program stays with its tasks', async () => {
    const { dailly } = await world()
    await send('POST', `/programs/${dailly.id}/tasks`, { key: 'LAB-5' })
    await send('PUT', '/focus', { program: dailly.id, level: 'P0' })

    expect((await send('PUT', '/focus', { program: dailly.id, level: null })).statusCode).toBe(204)

    expect((await send('GET', '/focus')).json()).toEqual({ P0: [], P1: [], P2: [] })
    expect((await send('GET', '/programs')).json()[0]).toMatchObject({ focus: null, tasks: [{ key: 'LAB-5' }] })
  })

  it('refuses a level outside P0–P2 or a body with neither or both targets with 400, and 404 for a target that does not exist', async () => {
    const { dailly } = await world()
    expect((await send('PUT', '/focus', { program: dailly.id, level: 'P3' })).json()).toEqual({
      errors: [{ field: 'level', message: 'o foco é P0, P1 ou P2' }],
    })
    expect((await send('PUT', '/focus', { level: 'P0' })).statusCode).toBe(400)
    expect((await send('PUT', '/focus', { program: dailly.id, task: 'LAB-1', level: 'P0' })).statusCode).toBe(400)
    expect((await send('PUT', '/focus', { program: 'nope', level: 'P0' })).statusCode).toBe(404)
    expect((await send('PUT', '/focus', { task: 'LAB-99', level: 'P0' })).statusCode).toBe(404)
  })
})
