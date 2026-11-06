// @vitest-environment jsdom
import type { TaskStore } from '@dailly/tasks-core'
import { inMemoryTaskStore } from '@dailly/tasks-core/testing'
import type { TasksPort } from '@shared'
import { testSharedDeps } from '@shared/testing.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, type App } from 'vue'
import Tasks from './Tasks.vue'

/**
 * Card #43 (F5), the statuses of a board on the screen: C1 to C8 in the board
 * "Casa". C9 is the API's, pinned in `server/src/tasks-statuses.test.ts`.
 */
const settle = async () => {
  for (let n = 0; n < 4; n += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

let app: App | undefined
afterEach(() => {
  localStorage.clear()
  app?.unmount()
  document.body.innerHTML = ''
})

const NOW = '2026-11-06T15:00:00.000Z'

async function casaStore(): Promise<{ store: TaskStore; casa: string }> {
  let n = 0
  const store = inMemoryTaskStore({ newId: () => `id-${(n += 1)}`, now: () => NOW })
  const casa = await store.createBoard({ name: 'Casa', prefix: 'CASA' })
  localStorage.setItem('dailly.tasks.board', casa.id)
  return { store, casa: casa.id }
}

const statusId = async (store: TaskStore, board: string, name: string) =>
  (await store.board(board))!.statuses.find((status) => status.name === name)!.id

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
})

async function mount(store: TaskStore) {
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp(Tasks, { deps: { ...testSharedDeps({ now: NOW }), tasks: portOver(store) } })
  app.mount(host)
  await settle()
  return host
}

const button = (root: Element | null, label: string) =>
  [...(root?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
  ) ?? null
const columns = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLElement>('[data-view] > section')].map((section) => section.getAttribute('aria-label'))
const column = (host: HTMLElement, name: string) => host.querySelector<HTMLElement>(`[data-view] > section[aria-label="${name}"]`)
const colorOf = (host: HTMLElement, name: string) => column(host, name)?.querySelector('[data-color]')?.getAttribute('data-color')
const keysIn = (host: HTMLElement, name: string) =>
  [...(column(host, name)?.querySelectorAll('li') ?? [])].map((li) => /CASA-\d+/.exec(li.textContent ?? '')?.[0])

function set(element: HTMLInputElement | HTMLSelectElement | null, value: string): void {
  if (!element) throw new Error('field not found')
  element.value = value
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input'))
}

async function submit(form: HTMLFormElement | null): Promise<void> {
  form!.dispatchEvent(new Event('submit', { cancelable: true }))
  await settle()
}

async function addStatus(host: HTMLElement, name: string, category: string, color: string): Promise<HTMLFormElement> {
  button(host.querySelector('nav'), 'Adicionar status')!.click()
  await settle()
  const form = host.querySelector<HTMLFormElement>('form[aria-label="Novo status"]')!
  set(form.querySelector('input[aria-label="Nome do status"]'), name)
  set(form.querySelector('select[aria-label="Categoria"]'), category)
  set(form.querySelector('select[aria-label="Cor"]'), color)
  await submit(form)
  return form
}

async function listView(host: HTMLElement): Promise<void> {
  button(host.querySelector('nav'), 'Lista')!.click()
  await settle()
}

describe('C1: Adicionar um status entra junto da sua categoria (J6.1, RN2, RN11)', () => {
  it('"Revisão" aparece roxo depois de "Fazendo" e antes de "Feito", no board e na lista', async () => {
    const { store } = await casaStore()
    const host = await mount(store)

    await addStatus(host, 'Revisão', 'started', 'purple')

    expect(columns(host)).toEqual(['Backlog', 'A fazer', 'Fazendo', 'Revisão', 'Feito', 'Cancelado'])
    expect(colorOf(host, 'Revisão')).toBe('purple')
    expect(host.querySelector('form[aria-label="Novo status"]')).toBeNull()
    await listView(host)
    expect(columns(host)).toEqual(['Backlog', 'A fazer', 'Fazendo', 'Revisão', 'Feito', 'Cancelado'])
    expect(colorOf(host, 'Revisão')).toBe('purple')
  })
})

describe('C2: Nome vazio ou repetido no board é recusado (J6.1a, RN11)', () => {
  it.each([
    ['', 'o nome é obrigatório'],
    ['Feito', 'já existe um status "Feito" neste board'],
  ])('o nome %j mostra "%s", e o board continua com os cinco', async (name, message) => {
    const { store } = await casaStore()
    const host = await mount(store)

    const form = await addStatus(host, name, 'started', 'purple')

    expect(form.querySelector('[role="alert"]')?.textContent?.trim()).toBe(message)
    expect(columns(host)).toHaveLength(5)
  })
})

describe('C3: Cada board nasce com os seus cinco status (RN11)', () => {
  it('"Lar" mostra só os cinco, e "Casa" continua com "Revisão"', async () => {
    const { store, casa } = await casaStore()
    await store.addStatus(casa, { name: 'Revisão', category: 'started', color: 'purple' })
    const host = await mount(store)

    button(host, 'Novo board')!.click()
    await settle()
    const form = host.querySelector<HTMLFormElement>('form[aria-label="Novo board"]')!
    set(form.querySelector('input[aria-label="Nome do board"]'), 'Lar')
    set(form.querySelector('input[aria-label="Prefixo do board"]'), 'LAR')
    await submit(form)

    expect(columns(host)).toEqual(['Backlog', 'A fazer', 'Fazendo', 'Feito', 'Cancelado'])
    expect((await store.board(casa))!.statuses.map((status) => status.name)).toContain('Revisão')
  })
})

describe('C4: Renomear e trocar a cor não mexe nas tarefas (J6.2, RN2)', () => {
  it('a coluna e o grupo mostram "Entregue" em verde, e CASA-1 continua nele, concluída', async () => {
    const { store, casa } = await casaStore()
    const done = await statusId(store, casa, 'Feito')
    await store.create({ boardId: casa, title: 'Trocar a lâmpada', statusId: done })
    await store.update({ prefix: 'CASA', key: 1 }, { placement: { statusId: done, rank: 'i' } })
    const host = await mount(store)

    button(column(host, 'Feito'), 'Editar status Feito')!.click()
    await settle()
    const form = host.querySelector<HTMLFormElement>('form[aria-label="Editar status"]')!
    expect(form.querySelector('select[aria-label="Categoria"]')).toBeNull()
    set(form.querySelector('input[aria-label="Nome do status"]'), 'Entregue')
    set(form.querySelector('select[aria-label="Cor"]'), 'green')
    await submit(form)

    expect(colorOf(host, 'Entregue')).toBe('green')
    expect(keysIn(host, 'Entregue')).toEqual(['CASA-1'])
    expect(column(host, 'Entregue')?.textContent).toContain('concluída em 06/11')
    await listView(host)
    expect(colorOf(host, 'Entregue')).toBe('green')
    expect(keysIn(host, 'Entregue')).toEqual(['CASA-1'])
  })
})

describe('C5: Apagar um status sem tarefas (J6.3)', () => {
  it('a coluna e o grupo "Revisão" somem', async () => {
    const { store, casa } = await casaStore()
    await store.addStatus(casa, { name: 'Revisão', category: 'started', color: 'purple' })
    const host = await mount(store)

    button(column(host, 'Revisão'), 'Apagar status Revisão')!.click()
    await settle()
    const dialog = host.querySelector('[role="alertdialog"]')!
    expect(dialog.querySelector('select')).toBeNull()
    button(dialog, 'Apagar status')!.click()
    await settle()

    expect(columns(host)).not.toContain('Revisão')
    await listView(host)
    expect(columns(host)).not.toContain('Revisão')
  })
})

describe('C6: O último status do board não se apaga (J6.3a, RN11)', () => {
  it('mostra "o board precisa de ao menos um status", e "A fazer" continua', async () => {
    const { store, casa } = await casaStore()
    for (const status of (await store.board(casa))!.statuses) {
      if (status.name !== 'A fazer') await store.deleteStatus(status.id)
    }
    const host = await mount(store)

    button(column(host, 'A fazer'), 'Apagar status A fazer')!.click()
    await settle()
    button(host.querySelector('[role="alertdialog"]'), 'Apagar status')!.click()
    await settle()

    expect(host.querySelector('[role="alertdialog"] [role="alert"]')?.textContent?.trim()).toBe(
      'o board precisa de ao menos um status',
    )
    expect(columns(host)).toEqual(['A fazer'])
  })
})

describe('C7: Apagar um status com tarefas leva elas ao topo do destino (J6.4, RN12, RN3)', () => {
  it('"Feito" mostra CASA-1, CASA-2 e CASA-3, e CASA-1 e CASA-2 ficam concluídas hoje', async () => {
    const { store, casa } = await casaStore()
    const review = (await store.addStatus(casa, { name: 'Revisão', category: 'started', color: 'purple' }))!
    const done = await statusId(store, casa, 'Feito')
    await store.create({ boardId: casa, title: 'um', statusId: review.id })
    await store.create({ boardId: casa, title: 'dois', statusId: review.id })
    // CASA-1 above CASA-2 in "Revisão", as the scenario has them.
    await store.update({ prefix: 'CASA', key: 1 }, { placement: { statusId: review.id, rank: '1' } })
    await store.create({ boardId: casa, title: 'três', statusId: done })
    const host = await mount(store)
    expect(keysIn(host, 'Revisão')).toEqual(['CASA-1', 'CASA-2'])

    button(column(host, 'Revisão'), 'Apagar status Revisão')!.click()
    await settle()
    const dialog = host.querySelector('[role="alertdialog"]')!
    set(dialog.querySelector('select[aria-label="Mover as tarefas para"]'), done)
    button(dialog, 'Apagar status')!.click()
    await settle()

    expect(columns(host)).not.toContain('Revisão')
    expect(keysIn(host, 'Feito')).toEqual(['CASA-1', 'CASA-2', 'CASA-3'])
    const labels = [...column(host, 'Feito')!.querySelectorAll('li')].map((li) => li.textContent ?? '')
    expect(labels[0]).toContain('concluída em 06/11')
    expect(labels[1]).toContain('concluída em 06/11')
  })
})

describe('C8: Cancelar a escolha do destino não muda nada (J6.4a)', () => {
  it('"Revisão" continua, com a tarefa nele', async () => {
    const { store, casa } = await casaStore()
    const review = (await store.addStatus(casa, { name: 'Revisão', category: 'started', color: 'purple' }))!
    await store.create({ boardId: casa, title: 'um', statusId: review.id })
    const host = await mount(store)

    button(column(host, 'Revisão'), 'Apagar status Revisão')!.click()
    await settle()
    const dialog = host.querySelector('[role="alertdialog"]')!
    expect(dialog.querySelector('select[aria-label="Mover as tarefas para"]')).not.toBeNull()
    button(dialog, 'Cancelar')!.click()
    await settle()

    expect(host.querySelector('[role="alertdialog"]')).toBeNull()
    expect(keysIn(host, 'Revisão')).toEqual(['CASA-1'])
    expect((await store.board(casa))!.statuses.map((status) => status.name)).toContain('Revisão')
  })
})

describe('gate #43: the last status, with tasks, asks for no destination', () => {
  it('sends no moveTo, so the API answers with RN11 and not with a bad moveTo', async () => {
    const { store, casa } = await casaStore()
    for (const status of (await store.board(casa))!.statuses) {
      if (status.name !== 'A fazer') await store.deleteStatus(status.id)
    }
    await store.create({ boardId: casa, title: 'um', statusId: await statusId(store, casa, 'A fazer') })
    const calls: (string | undefined)[] = []
    const host = document.createElement('div')
    document.body.append(host)
    app = createApp(Tasks, {
      deps: {
        ...testSharedDeps({ now: NOW }),
        tasks: {
          ...portOver(store),
          deleteStatus: (id: string, moveTo?: string) => {
            calls.push(moveTo)
            return store.deleteStatus(id, moveTo)
          },
        },
      },
    })
    app.mount(host)
    await settle()

    button(column(host, 'A fazer'), 'Apagar status A fazer')!.click()
    await settle()
    const dialog = host.querySelector('[role="alertdialog"]')!
    expect(dialog.querySelector('select')).toBeNull()
    button(dialog, 'Apagar status')!.click()
    await settle()

    expect(calls).toEqual([undefined])
    expect(dialog.querySelector('[role="alert"]')?.textContent?.trim()).toBe('o board precisa de ao menos um status')
  })
})
