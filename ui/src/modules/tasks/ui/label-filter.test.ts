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
 * The label filter on the Tasks screen, C1 to C8: the board "Tasks" holds
 * T-1 with "bug", T-2 with "ui" and T-3 with none; "docs" exists and no task
 * carries it.
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

const BUG: Label = { id: 'l-bug', name: 'bug', color: 'red' }
const UI: Label = { id: 'l-ui', name: 'ui', color: 'blue' }
const DOCS: Label = { id: 'l-docs', name: 'docs', color: 'green' }

async function world(seed: readonly Label[] = [BUG, UI, DOCS]) {
  const labels = testLabelsPort(seed)
  let n = 0
  const store = inMemoryTaskStore({
    newId: () => `id-${(n += 1)}`,
    now: () => '2026-11-24T12:00:00.000Z',
    labels: () => seed.map((label) => label.id),
  })
  const known = new Set(seed.map((label) => label.id))
  const tagged = (ids: string[]) => ids.filter((id) => known.has(id))
  await store.create({ boardId: SEED_BOARD.id, title: 'Bug no login', statusId: 'todo', labelIds: tagged(['l-bug']) })
  await store.create({ boardId: SEED_BOARD.id, title: 'Ajustar cor', statusId: 'todo', labelIds: tagged(['l-ui']) })
  await store.create({ boardId: SEED_BOARD.id, title: 'Ler docs', statusId: 'doing' })
  return { labels, store }
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

const filterBar = (host: HTMLElement) => host.querySelector<HTMLElement>('[role="group"][aria-label="Filtrar por label"]')
/** The titles on screen, board or list, sorted: the order is RN3's, not the filter's. */
const visible = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLElement>('[data-view] li')].flatMap((li) =>
    ['Bug no login', 'Ajustar cor', 'Ler docs', 'Casa com bug', 'Casa sem label', 'Corrigir o form'].filter((title) =>
      li.textContent?.includes(title),
    ),
  ).sort()
const columns = (host: HTMLElement) => host.querySelectorAll('[data-view="board"] > *').length
const buttonNamed = (host: HTMLElement, name: string) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`) ??
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === name) ??
  null

async function toggle(host: HTMLElement, name: string): Promise<void> {
  ;[...filterBar(host)!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === name)!.click()
  await settle()
}

async function click(host: HTMLElement, name: string): Promise<void> {
  buttonNamed(host, name)!.click()
  await settle()
}

describe('C1: ligar uma label mostra só as tarefas com ela', () => {
  it('no board e na lista fica só T-1, e todas as colunas continuam', async () => {
    const host = await mount(await world())
    const before = columns(host)

    await toggle(host, 'bug')

    expect(visible(host)).toEqual(['Bug no login'])
    expect(columns(host)).toBe(before)
    expect(filterBar(host)!.querySelector('[aria-pressed="true"]')?.textContent?.trim()).toBe('bug')
    await click(host, 'Lista')
    expect(visible(host)).toEqual(['Bug no login'])
  })
})

describe('C2: labels ligadas somam (OU)', () => {
  it('com bug e ui aparecem T-1 e T-2', async () => {
    const host = await mount(await world())

    await toggle(host, 'bug')
    await toggle(host, 'ui')

    expect(visible(host)).toEqual(['Ajustar cor', 'Bug no login'])
  })
})

describe('C3: desligar ou limpar volta o board inteiro', () => {
  it('desligando a última label', async () => {
    const host = await mount(await world())
    await toggle(host, 'bug')

    await toggle(host, 'bug')

    expect(visible(host)).toEqual(['Ajustar cor', 'Bug no login', 'Ler docs'])
    expect(buttonNamed(host, 'Limpar filtro')).toBeNull()
  })

  it('com "Limpar filtro"', async () => {
    const host = await mount(await world())
    await toggle(host, 'bug')
    await toggle(host, 'ui')

    await click(host, 'Limpar filtro')

    expect(visible(host)).toEqual(['Ajustar cor', 'Bug no login', 'Ler docs'])
    expect(filterBar(host)!.querySelector('[aria-pressed="true"]')).toBeNull()
  })
})

describe('C4: um filtro que esconde tudo diz isso, e não convida a criar a primeira', () => {
  it('com só docs ligada', async () => {
    const host = await mount(await world())

    await toggle(host, 'docs')

    expect(visible(host)).toEqual([])
    expect(host.textContent).toContain('nenhuma tarefa com esse filtro')
    expect(host.textContent).not.toContain('Nenhuma tarefa ainda')
    await click(host, 'Limpar filtro')
    expect(visible(host)).toHaveLength(3)
  })
})

describe('C5: o filtro vale entre boards e não sobrevive a recarregar', () => {
  it('trocando para Casa, só a tarefa com bug; remontando, tudo volta', async () => {
    const w = await world()
    const casa = await w.store.createBoard({ name: 'Casa', prefix: 'CASA' })
    const todo = (await w.store.board(casa.id))!.statuses.find((s) => s.category === 'unstarted')!
    await w.store.create({ boardId: casa.id, title: 'Casa com bug', statusId: todo.id, labelIds: ['l-bug'] })
    await w.store.create({ boardId: casa.id, title: 'Casa sem label', statusId: todo.id })
    const host = await mount(w)
    await toggle(host, 'bug')

    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Board"]')!
    select.value = casa.id
    select.dispatchEvent(new Event('change'))
    await settle()
    expect(visible(host)).toEqual(['Casa com bug'])

    app!.unmount()
    document.body.innerHTML = ''
    const again = await mount(w)
    expect(filterBar(again)!.querySelector('[aria-pressed="true"]')).toBeNull()
    expect(visible(again)).toEqual(['Casa com bug', 'Casa sem label'])
  })
})

describe('C6: a tarefa que perde a label sai do filtro', () => {
  it('tirando bug de T-1 no painel, T-1 some do board', async () => {
    const host = await mount(await world())
    await toggle(host, 'bug')
    host.querySelector<HTMLElement>('[data-view] li')!.click()
    await settle()
    const panel = host.querySelector<HTMLElement>('[role="dialog"]')!

    panel.querySelector<HTMLButtonElement>('button[aria-label="Tirar bug"]')!.click()
    await settle()
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))
    await settle()

    expect(visible(host)).toEqual([])
  })
})

describe('C7: sem label nenhuma, não há barra de filtro', () => {
  it('o board aparece inteiro e sem a barra', async () => {
    const host = await mount(await world([]))

    expect(filterBar(host)).toBeNull()
    expect(visible(host)).toHaveLength(3)
  })
})

describe('C8: uma tarefa criada com o filtro ligado nasce com as labels dele', () => {
  it('criada pelo + de A fazer, com bug ligada, nasce com bug e aparece', async () => {
    const w = await world()
    const host = await mount(w)
    await toggle(host, 'bug')

    await click(host, 'Nova tarefa em A fazer')
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Título da nova tarefa"]')!
    input.value = 'Corrigir o form'
    input.dispatchEvent(new Event('input'))
    input.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await settle()
    await settle()

    expect(visible(host)).toContain('Corrigir o form')
    const born = (await w.store.board(SEED_BOARD.id))!.tasks.find((t) => t.title === 'Corrigir o form')
    expect(born?.labelIds).toEqual(['l-bug'])
  })
})

describe('uma label apagada em outra tela sai do filtro', () => {
  it('com bug ligada e apagada no Daily Log, a próxima leitura volta o board inteiro', async () => {
    const w = await world()
    const casa = await w.store.createBoard({ name: 'Casa', prefix: 'CASA' })
    const todo = (await w.store.board(casa.id))!.statuses.find((s) => s.category === 'unstarted')!
    await w.store.create({ boardId: casa.id, title: 'Casa com bug', statusId: todo.id, labelIds: ['l-bug'] })
    await w.store.create({ boardId: casa.id, title: 'Casa sem label', statusId: todo.id })
    const host = await mount(w)
    await toggle(host, 'bug')

    await w.labels.delete('l-bug')
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Board"]')!
    select.value = casa.id
    select.dispatchEvent(new Event('change'))
    await settle()

    expect(visible(host)).toEqual(['Casa com bug', 'Casa sem label'])
    expect(buttonNamed(host, 'Limpar filtro')).toBeNull()
  })
})
