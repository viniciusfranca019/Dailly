import { describe, expect, it } from 'vitest'
import { ApiError } from './errors.js'
import { httpProgramsClient } from './http-programs-client.js'

const config = { baseUrl: '/api' }
const program = {
  id: 'p1',
  name: 'Dailly v1',
  objective: 'fechar a v1',
  windowStart: '2026-11-25',
  windowEnd: '2026-12-19',
  exitWhen: 'os cards em Done',
  focus: null,
}
const withTasks = { ...program, tasks: [{ key: 'LAB-5', title: 'markdown', status: 'To Do', boardId: 'labs' }] }

const answering = (status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}) =>
  (async (url: string, init?: RequestInit) => {
    seen.url = url
    seen.init = init
    return status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status })
  }) as unknown as typeof fetch

describe('httpProgramsClient (LAB-9)', () => {
  it('reads the programs with their tasks', async () => {
    const seen: { url?: string } = {}
    const client = httpProgramsClient({ config, fetch: answering(200, [withTasks], seen) })
    expect(await client.programs()).toEqual([withTasks])
    expect(seen.url).toBe('/api/programs')
  })

  it('creates a program with a POST of its fields', async () => {
    const seen: { url?: string; init?: RequestInit } = {}
    const client = httpProgramsClient({ config, fetch: answering(201, program, seen) })
    const { id: _id, focus: _focus, ...input } = program
    expect(await client.createProgram(input)).toEqual(program)
    expect(seen.init?.method).toBe('POST')
    expect(JSON.parse(String(seen.init?.body))).toEqual(input)
  })

  it('adds a task by its key, null when the program is gone, and throws the refusal', async () => {
    const seen: { url?: string; init?: RequestInit } = {}
    expect(await httpProgramsClient({ config, fetch: answering(200, withTasks, seen) }).addToProgram('p1', 'LAB-5')).toEqual(
      withTasks,
    )
    expect(seen.url).toBe('/api/programs/p1/tasks')
    expect(JSON.parse(String(seen.init?.body))).toEqual({ key: 'LAB-5' })
    expect(
      await httpProgramsClient({ config, fetch: answering(404, { error: 'programa não encontrado' }) }).addToProgram('x', 'LAB-5'),
    ).toBeNull()
    await expect(
      httpProgramsClient({ config, fetch: answering(409, { error: 'LAB-5 já está no programa Dailly v1' }) }).addToProgram(
        'p2',
        'LAB-5',
      ),
    ).rejects.toThrow('LAB-5 já está no programa Dailly v1')
  })

  it('a task that does not exist is a refusal, not a program that is gone', async () => {
    await expect(
      httpProgramsClient({ config, fetch: answering(404, { error: 'tarefa não encontrada' }) }).addToProgram('p1', 'LAB-999'),
    ).rejects.toThrow('tarefa não encontrada')
  })

  it("reads a task's program, and null for a task that is gone", async () => {
    const seen: { url?: string } = {}
    expect(
      await httpProgramsClient({ config, fetch: answering(200, { program }, seen) }).programOf({ prefix: 'LAB', key: 5 }),
    ).toEqual({ program })
    expect(seen.url).toBe('/api/tasks/LAB-5/program')
    expect(
      await httpProgramsClient({ config, fetch: answering(404, { error: 'tarefa não encontrada' }) }).programOf({
        prefix: 'LAB',
        key: 9,
      }),
    ).toBeNull()
  })

  it('reads and sets the focus', async () => {
    const focus = { P0: [{ kind: 'program', id: 'p1', name: 'Dailly v1' }], P1: [{ kind: 'task', key: 'LAB-8', title: 'pages' }], P2: [] }
    expect(await httpProgramsClient({ config, fetch: answering(200, focus) }).focus()).toEqual(focus)

    const seen: { url?: string; init?: RequestInit } = {}
    expect(await httpProgramsClient({ config, fetch: answering(204, null, seen) }).setFocus({ program: 'p1' }, 'P0')).toBe(true)
    expect(seen.url).toBe('/api/focus')
    expect(seen.init?.method).toBe('PUT')
    expect(JSON.parse(String(seen.init?.body))).toEqual({ program: 'p1', level: 'P0' })
    expect(await httpProgramsClient({ config, fetch: answering(404, { error: 'x' }) }).setFocus({ task: 'LAB-9' }, null)).toBe(
      false,
    )
    await expect(
      httpProgramsClient({ config, fetch: answering(409, { error: 'LAB-5 é do programa Dailly v1: ponha o programa em foco' }) }).setFocus(
        { task: 'LAB-5' },
        'P0',
      ),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it('refuses an answer of the wrong shape', async () => {
    await expect(httpProgramsClient({ config, fetch: answering(200, [{ id: 1 }]) }).programs()).rejects.toThrow(
      'num formato que não reconheço',
    )
  })
})
