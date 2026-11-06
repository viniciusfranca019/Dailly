// @vitest-environment jsdom
import type { TaskStore } from '@dailly/tasks-core'
import { inMemoryTaskStore } from '@dailly/tasks-core/testing'
import type { TasksPort } from '@shared'
import { testSharedDeps } from '@shared/testing.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, type App } from 'vue'
import Tasks from './Tasks.vue'

/** Card #21, C1 to C7: the board, the drag, and the switch to the list. */
const settle = async () => {
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

let app: App | undefined
beforeEach(() => localStorage.clear())
afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
})

let clock = 0
const storeWith = async (seed: readonly [string, string][] = []): Promise<TaskStore> => {
  let n = 0
  const store = inMemoryTaskStore({
    newId: () => `id-${(n += 1)}`,
    now: () => new Date(Date.parse('2026-11-05T12:00:00.000Z') + (clock += 1) * 1000).toISOString(),
  })
  for (const [title, statusId] of seed) await store.create({ boardId: 'tasks', title, statusId })
  return store
}

const portOver = (store: TaskStore, over: Partial<TasksPort> = {}): TasksPort => ({
  boards: () => store.boards(),
  createBoard: (input) => store.createBoard(input),
  updateBoard: (id, patch) => store.updateBoard(id, patch),
  board: (boardId) => store.board(boardId),
  create: (input) => store.create(input),
  update: (key, patch) => store.update(key, patch),
  delete: (key) => store.delete(key),
  comments: (key) => store.comments(key),
  addComment: (key, body) => store.addComment(key, body),
  deleteComment: async (key, id) => (await store.deleteComment(key, id)) === 'deleted',
  ...over,
})

async function mount(tasks: TasksPort) {
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp(Tasks, { deps: { ...testSharedDeps(), tasks } })
  app.mount(host)
  await settle()
  return host
}

/** Unmount and mount again over the same port: what a reload does. */
async function reload(tasks: TasksPort) {
  app?.unmount()
  document.body.innerHTML = ''
  return mount(tasks)
}

const column = (host: HTMLElement, name: string) => host.querySelector<HTMLElement>(`section[aria-label="${name}"]`)
const keysIn = (section: HTMLElement | null) =>
  [...(section?.querySelectorAll<HTMLElement>('li') ?? [])].map((li) => /T-\d+/.exec(li.textContent ?? '')?.[0])
const card = (host: HTMLElement, key: string) =>
  [...host.querySelectorAll<HTMLElement>('li')].find((li) => li.textContent?.includes(key))!
const viewButton = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label)!

/** HTML5 drag, the way a person does it: grab, then let go over a target. */
async function drag(from: HTMLElement, onto: HTMLElement): Promise<void> {
  from.dispatchEvent(new Event('dragstart', { bubbles: true }))
  onto.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }))
  onto.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }))
  await settle()
}

describe('C1: arrastar para outra coluna muda o status', () => {
  it('T-1 fica em "Fazendo", onde foi solta, depois de recarregar', async () => {
    const port = portOver(await storeWith([['um', 'todo'], ['dois', 'doing'], ['três', 'doing']]))
    let host = await mount(port)
    // "Fazendo" holds T-3 on top of T-2; T-1 is dropped on T-2, so it lands between them.
    await drag(card(host, 'T-1'), card(host, 'T-2'))

    host = await reload(port)
    expect(keysIn(column(host, 'Fazendo'))).toEqual(['T-3', 'T-1', 'T-2'])
    expect(keysIn(column(host, 'A fazer'))).toEqual([])
  })

  it('soltar na área vazia da coluna põe o card no fim dela', async () => {
    const port = portOver(await storeWith([['um', 'todo'], ['dois', 'doing']]))
    let host = await mount(port)
    await drag(card(host, 'T-1'), column(host, 'Fazendo')!)

    host = await reload(port)
    expect(keysIn(column(host, 'Fazendo'))).toEqual(['T-2', 'T-1'])
  })
})

describe('C2: arrastar dentro da coluna muda a ordem', () => {
  it('T-2 solta em cima de T-1 aparece acima dela depois de recarregar', async () => {
    // Created T-2 then T-1 on top: start from T-1 above T-2.
    const store = await storeWith([['dois', 'todo'], ['um', 'todo']])
    const port = portOver(store)
    let host = await mount(port)
    expect(keysIn(column(host, 'A fazer'))).toEqual(['T-2', 'T-1'])
    // Bring T-1 to the top first, then the scenario: T-1 above T-2, drag T-2 onto T-1.
    await drag(card(host, 'T-1'), card(host, 'T-2'))
    expect(keysIn(column(host, 'A fazer'))).toEqual(['T-1', 'T-2'])

    await drag(card(host, 'T-2'), card(host, 'T-1'))

    host = await reload(port)
    expect(keysIn(column(host, 'A fazer'))).toEqual(['T-2', 'T-1'])
  })
})

describe('C3: concluir carimba o dia (RN3)', () => {
  it('mostra "concluída em <dia>" em "Feito", e a marca some ao voltar para "Fazendo"', async () => {
    const host = await mount(portOver(await storeWith([['um', 'doing']])))

    await drag(card(host, 'T-1'), column(host, 'Feito')!)
    expect(card(host, 'T-1').textContent).toMatch(/concluída em \d{2}\/\d{2}/)

    await drag(card(host, 'T-1'), column(host, 'Fazendo')!)
    expect(card(host, 'T-1').textContent).not.toContain('concluída em')
  })
})

describe('C4: gravação recusada volta o card (RN7)', () => {
  it('T-1 volta para "A fazer" e a mensagem do erro aparece', async () => {
    const host = await mount(
      portOver(await storeWith([['um', 'todo']]), {
        update: async () => {
          throw new Error('a API recusou a requisição')
        },
      }),
    )

    await drag(card(host, 'T-1'), column(host, 'Fazendo')!)

    expect(keysIn(column(host, 'A fazer'))).toEqual(['T-1'])
    expect(keysIn(column(host, 'Fazendo'))).toEqual([])
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('a API recusou a requisição')
  })
})

describe('C5: lista e board mostram o mesmo (RN4)', () => {
  it('as mesmas tarefas, agrupadas por status, com a contagem, na mesma ordem', async () => {
    const host = await mount(portOver(await storeWith([['a', 'backlog'], ['b', 'todo'], ['c', 'todo'], ['d', 'doing']])))
    expect(host.querySelector('[data-view="board"]')).not.toBeNull()
    const onBoard = ['Backlog', 'A fazer', 'Fazendo'].map((name) => keysIn(column(host, name)))

    viewButton(host, 'Lista').click()
    await settle()

    expect(host.querySelector('[data-view="list"]')).not.toBeNull()
    expect(['Backlog', 'A fazer', 'Fazendo'].map((name) => keysIn(column(host, name)))).toEqual(onBoard)
    expect(column(host, 'A fazer')?.querySelector('header')?.textContent).toContain('2')
  })
})

describe('C6: a visualização é lembrada', () => {
  it('volta na Lista depois de recarregar; na primeira visita, abre o board', async () => {
    const port = portOver(await storeWith([['a', 'todo']]))
    let host = await mount(port)
    expect(host.querySelector('[data-view="board"]')).not.toBeNull()

    viewButton(host, 'Lista').click()
    await settle()
    host = await reload(port)

    expect(host.querySelector('[data-view="list"]')).not.toBeNull()
    expect(viewButton(host, 'Lista').getAttribute('aria-pressed')).toBe('true')
  })
})

describe('C7: vazio nas duas visualizações', () => {
  it('board e Lista mostram o estado vazio com o convite para criar', async () => {
    const host = await mount(portOver(await storeWith()))
    expect(host.textContent).toContain('Nenhuma tarefa ainda')

    viewButton(host, 'Lista').click()
    await settle()
    expect(host.textContent).toContain('Nenhuma tarefa ainda')

    viewButton(host, 'Board').click()
    await settle()
    expect(host.textContent).toContain('Nenhuma tarefa ainda')
  })
})

describe('a cancelled drag', () => {
  it('moves nothing when something else is dropped on a column afterwards', async () => {
    const store = await storeWith([['um', 'todo']])
    const host = await mount(portOver(store))

    // Grab T-1 and let go outside every column: dragend, no drop.
    card(host, 'T-1').dispatchEvent(new Event('dragstart', { bubbles: true }))
    card(host, 'T-1').dispatchEvent(new Event('dragend', { bubbles: true }))
    // Then some selected text is dropped on "Feito".
    column(host, 'Feito')!.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }))
    await settle()

    expect((await store.board('tasks'))!.tasks.map((task) => [task.key, task.statusId, task.completedAt])).toEqual([
      [1, 'todo', null],
    ])
  })
})

describe('a tie in the ranks, which two stale tabs can write', () => {
  it('shows the refusal and rereads the board instead of failing in silence', async () => {
    const store = await storeWith([['um', 'todo'], ['dois', 'todo'], ['três', 'todo']])
    await store.update({ prefix: 'T', key: 1 }, { placement: { statusId: 'doing', rank: 'm' } })
    await store.update({ prefix: 'T', key: 2 }, { placement: { statusId: 'doing', rank: 'm' } })
    let reads = 0
    const host = await mount(
      portOver(store, {
        board: async (boardId) => {
          reads += 1
          return store.board(boardId)
        },
      }),
    )
    const before = reads

    // The lower of the two tied cards: its neighbour above has the same rank.
    const lower = keysIn(column(host, 'Fazendo'))[1]!
    await drag(card(host, 'T-3'), card(host, lower))

    expect(host.querySelector('[role="alert"]')?.textContent).toBeTruthy()
    expect(reads).toBeGreaterThan(before)
  })
})
