import { createEntry, fixedClock, uuidIds } from '@dailly/domain'
import { placeAt } from '@dailly/tasks-core'
import { afterAll, describe, expect, it } from 'vitest'
import { createServer, type RunningServer } from '../server/src/index.js'
import { httpEntryRepository } from '../ui/src/adapters/http-entry-repository.js'
import { httpTasksClient } from '../ui/src/adapters/http-tasks-client.js'

/**
 * Tasks across a real socket, through the adapters the app uses: card #20's
 * C3, C4 and C7 where they can only fail for real, the payload shape between
 * the two halves and the two modules sharing one `entries` table.
 */
const running: RunningServer[] = []

afterAll(async () => {
  await Promise.all(running.map((server) => server.close()))
})

async function overTheWire() {
  const server = await createServer({ databaseFile: ':memory:' })
  running.push(server)
  const config = { baseUrl: server.url }
  return { server, tasks: httpTasksClient({ config }), entries: httpEntryRepository({ config }) }
}

describe('Tasks, end to end', () => {
  it('#42: a board created through the adapter keys its tasks, and the whole key travels as the path', async () => {
    const { tasks } = await overTheWire()
    const casa = await tasks.createBoard({ name: 'Casa', prefix: 'CASA' })
    await tasks.create({ boardId: casa.id, title: 'Trocar a lâmpada', statusId: 'todo' })
    await tasks.updateBoard(casa.id, { prefix: 'LAR' })
    const second = await tasks.create({ boardId: casa.id, title: 'Pintar a sala', statusId: 'todo' })

    expect(await tasks.boards()).toEqual([{ id: 'tasks', name: 'Tasks', prefix: 'T' }, { ...casa, prefix: 'LAR' }])
    expect([second.keyPrefix, second.key]).toEqual(['LAR', 2])
    expect(await tasks.update({ prefix: 'CASA', key: 1 }, { priority: 1 })).toMatchObject({ title: 'Trocar a lâmpada' })
    expect((await tasks.board('tasks'))!.tasks).toEqual([])
    await expect(tasks.createBoard({ name: 'Casinha', prefix: 'CASA' })).rejects.toThrow(
      'o prefixo CASA já foi usado por um board',
    )
  })

  it('C3: a task created through the adapter comes back on top of its status', async () => {
    const { tasks } = await overTheWire()
    await tasks.create({ boardId: 'tasks', title: 'Antiga', statusId: 'todo' })
    const created = await tasks.create({ boardId: 'tasks', title: 'Comprar café', statusId: 'todo' })

    const board = (await tasks.board('tasks'))!
    expect(created).toMatchObject({ key: 2, priority: 0 })
    expect(board.tasks.map((task) => task.title)).toEqual(['Comprar café', 'Antiga'])
  })

  it('C4: after DELETE /tasks/T-2, the next task is T-3', async () => {
    const { server, tasks } = await overTheWire()
    await tasks.create({ boardId: 'tasks', title: 'um', statusId: 'todo' })
    await tasks.create({ boardId: 'tasks', title: 'dois', statusId: 'todo' })

    const deleted = await fetch(`${server.url}/tasks/T-2`, { method: 'DELETE' })
    const third = await tasks.create({ boardId: 'tasks', title: 'três', statusId: 'todo' })

    expect(deleted.status).toBe(204)
    expect(third.key).toBe(3)
  })

  it('C7: the Daily Log timeline shows the day log and not the task', async () => {
    const { tasks, entries } = await overTheWire()
    await tasks.create({ boardId: 'tasks', title: 'Comprar café', statusId: 'todo' })
    await createEntry({ entries, clock: fixedClock(new Date().toISOString()), ids: uuidIds })({
      body: 'Registro do dia',
    })

    expect((await entries.list({})).map((entry) => entry.body)).toEqual(['Registro do dia'])
  })

  it('#21 C1, C3: a drop computed by placeAt travels as PATCH and the board reads it back, stamped', async () => {
    const { tasks } = await overTheWire()
    await tasks.create({ boardId: 'tasks', title: 'um', statusId: 'todo' })
    await tasks.create({ boardId: 'tasks', title: 'dois', statusId: 'done' })

    const before = (await tasks.board('tasks'))!
    const moved = await tasks.update({ prefix: 'T', key: 1 }, { placement: placeAt(before, 1, 'done', 2) })

    const after = (await tasks.board('tasks'))!
    expect(moved?.completedAt).toEqual(expect.any(String))
    expect(after.tasks.filter((task) => task.statusId === 'done').map((task) => task.key)).toEqual([1, 2])
  })

  it('#22 C2, C4, C6: the panel saves the fields and the body over the wire, deletes, and a gone task is null', async () => {
    const { tasks } = await overTheWire()
    await tasks.create({ boardId: 'tasks', title: 'um', statusId: 'todo' })

    const saved = await tasks.update({ prefix: 'T', key: 1 }, { title: 'Comprar café', priority: 2, body: '- moído fino' })
    expect(((await tasks.board('tasks'))!).tasks[0]).toEqual(saved)
    expect(saved).toMatchObject({ title: 'Comprar café', priority: 2, body: '- moído fino' })

    expect(await tasks.delete({ prefix: 'T', key: 1 })).toBe(true)
    expect(await tasks.update({ prefix: 'T', key: 1 }, { title: 'x' })).toBeNull()
    expect(((await tasks.board('tasks'))!).tasks).toEqual([])
  })
})
