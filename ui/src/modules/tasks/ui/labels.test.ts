// @vitest-environment jsdom
import type { Label } from '@dailly/domain'
import { SEED_BOARD, type TaskStore } from '@dailly/tasks-core'
import { inMemoryTaskStore } from '@dailly/tasks-core/testing'
import type { LabelsPort, TasksPort } from '@shared'
import { testLabelsPort, testSharedDeps } from '@shared/testing.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, type App } from 'vue'
import Tasks from './Tasks.vue'

/**
 * Card #46 (F8), the labels of a task on the screen: C1, C2, C4, C5 and C6.
 * C3 (the same label in the Daily Log) and C7 (the API's refusal) are pinned
 * in the server and in the shell's wiring.
 */
const settle = async () => {
  for (let n = 0; n < 5; n += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

let app: App | undefined
afterEach(() => {
  localStorage.clear()
  app?.unmount()
  document.body.innerHTML = ''
})

/** The labels port and the task store over the same labels, as the server has them. */
async function world(seed: readonly Label[] = []) {
  const labels = testLabelsPort(seed)
  let known: readonly string[] = seed.map((label) => label.id)
  const tracked: LabelsPort = {
    ...labels,
    list: async () => {
      const listed = await labels.list()
      known = listed.map((label) => label.id)
      return listed
    },
    create: async (input) => {
      const created = await labels.create(input)
      known = [...known, created.id]
      return created
    },
  }
  let n = 0
  const store = inMemoryTaskStore({ newId: () => `id-${(n += 1)}`, now: () => '2026-11-06T12:00:00.000Z', labels: () => known })
  await store.create({ boardId: SEED_BOARD.id, title: 'Comprar café', statusId: 'todo' })
  return { labels: tracked, store }
}

const portOver = (store: TaskStore): TasksPort => ({
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
  addStatus: (boardId, input) => store.addStatus(boardId, input),
  updateStatus: (id, patch) => store.updateStatus(id, patch),
  deleteStatus: (id, moveTo) => store.deleteStatus(id, moveTo),
  search: (text) => store.search(text),
})

async function mount({ labels, store }: { labels: LabelsPort; store: TaskStore }) {
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp(Tasks, { deps: { ...testSharedDeps(), tasks: portOver(store), labels } })
  app.mount(host)
  await settle()
  return host
}

const panel = (host: HTMLElement) => host.querySelector<HTMLElement>('[role="dialog"]')
const card = (host: HTMLElement) => host.querySelector<HTMLElement>('[data-view] li')
const chips = (root: Element | null) =>
  [...(root?.querySelectorAll<HTMLElement>('[data-label]') ?? [])].map((chip) => `${chip.textContent?.trim()}:${chip.dataset.color}`)
const chosen = (host: HTMLElement) =>
  [...(panel(host)?.querySelectorAll<HTMLElement>('[data-testid="chosen-label-name"]') ?? [])].map((name) => name.textContent?.trim())

async function openT1(host: HTMLElement): Promise<void> {
  card(host)!.click()
  await settle()
}

async function confirmLabel(host: HTMLElement, name: string): Promise<void> {
  const input = panel(host)!.querySelector<HTMLInputElement>('input[aria-label="Adicionar label"]')!
  input.value = name
  input.dispatchEvent(new Event('input'))
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await settle()
}

async function save(host: HTMLElement): Promise<void> {
  panel(host)!.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))
  await settle()
}

async function inList(host: HTMLElement): Promise<HTMLElement | null> {
  ;[...host.querySelectorAll<HTMLButtonElement>('nav button')].find((b) => b.textContent?.trim() === 'Lista')!.click()
  await settle()
  return host.querySelector<HTMLElement>('[data-view] li')
}

describe('C1: Aplicar uma label existente', () => {
  it('o card e a linha de T-1 mostram "trabalho" em azul', async () => {
    const host = await mount(await world([{ id: 'l1', name: 'trabalho', color: 'blue' }]))
    await openT1(host)

    await confirmLabel(host, 'trabalho')
    await save(host)

    expect(chips(card(host))).toEqual(['trabalho:blue'])
    expect(chips(await inList(host))).toEqual(['trabalho:blue'])
  })
})

describe('C2: Criar uma label digitando', () => {
  it('"casa" é criada com uma cor da paleta e aparece entre as escolhidas', async () => {
    const w = await world()
    const host = await mount(w)
    await openT1(host)

    await confirmLabel(host, 'casa')

    expect(chosen(host)).toEqual(['casa'])
    const [casa] = await w.labels.list()
    expect(casa).toMatchObject({ name: 'casa', color: expect.any(String) })
  })
})

describe('C4: Nome vazio não cria label', () => {
  it.each(['', '   '])('com %j, nada é criado', async (name) => {
    const w = await world()
    const host = await mount(w)
    await openT1(host)

    await confirmLabel(host, name)

    expect(await w.labels.list()).toEqual([])
    expect(chosen(host)).toEqual([])
  })
})

describe('C5: Mesmo nome com outra caixa usa a existente (RN13)', () => {
  it('T-1 recebe "Trabalho", e continua existindo uma label só', async () => {
    const w = await world([{ id: 'l1', name: 'Trabalho', color: 'blue' }])
    const host = await mount(w)
    await openT1(host)

    await confirmLabel(host, 'trabalho')
    await save(host)

    expect(chosen(host)).toEqual(['Trabalho'])
    expect(await w.labels.list()).toHaveLength(1)
    expect((await w.store.board(SEED_BOARD.id))!.tasks[0]?.labelIds).toEqual(['l1'])
  })
})

describe('C6: Tirar a label da tarefa', () => {
  it('o card e a linha não mostram mais "trabalho", e ela continua na lista', async () => {
    const w = await world([{ id: 'l1', name: 'trabalho', color: 'blue' }])
    await w.store.update({ prefix: 'T', key: 1 }, { labelIds: ['l1'] })
    const host = await mount(w)
    expect(chips(card(host))).toEqual(['trabalho:blue'])
    await openT1(host)

    panel(host)!.querySelector<HTMLButtonElement>('button[aria-label="Tirar trabalho"]')!.click()
    await settle()
    await save(host)

    expect(chips(card(host))).toEqual([])
    expect(chips(await inList(host))).toEqual([])
    expect(await w.labels.list()).toHaveLength(1)
  })
})

describe('gate #46: a label deleted while the panel is open', () => {
  it('leaves the draft on the next save, so the edit still saves', async () => {
    const w = await world([{ id: 'l1', name: 'trabalho', color: 'blue' }])
    await w.store.update({ prefix: 'T', key: 1 }, { labelIds: ['l1'] })
    const host = await mount(w)
    await openT1(host)
    const title = panel(host)!.querySelector<HTMLInputElement>('input[aria-label="Título"]')!
    title.value = 'novo'
    title.dispatchEvent(new Event('input'))

    await w.labels.delete('l1')
    await w.labels.list()
    await save(host)
    await save(host)

    expect((await w.store.board(SEED_BOARD.id))!.tasks[0]).toMatchObject({ title: 'novo', labelIds: [] })
  })
})

describe('gate #46, round 2: a labels read that failed strips nothing', () => {
  it('saves only the title, and T-1 keeps "trabalho"', async () => {
    const w = await world([{ id: 'l1', name: 'trabalho', color: 'blue' }])
    await w.store.update({ prefix: 'T', key: 1 }, { labelIds: ['l1'] })
    const host = await mount({
      store: w.store,
      labels: {
        ...w.labels,
        list: async () => {
          throw new Error('não consegui falar com a API local')
        },
      },
    })
    await openT1(host)
    const title = panel(host)!.querySelector<HTMLInputElement>('input[aria-label="Título"]')!
    title.value = 'novo'
    title.dispatchEvent(new Event('input'))

    await save(host)

    expect((await w.store.board(SEED_BOARD.id))!.tasks[0]).toMatchObject({ title: 'novo', labelIds: ['l1'] })
  })
})
