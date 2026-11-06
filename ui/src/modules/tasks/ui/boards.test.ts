// @vitest-environment jsdom
import { SEED_BOARD, type TaskStore } from '@dailly/tasks-core'
import { inMemoryTaskStore } from '@dailly/tasks-core/testing'
import type { TasksPort } from '@shared'
import { testSharedDeps } from '@shared/testing.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, type App } from 'vue'
import Tasks from './Tasks.vue'

/**
 * Card #42 (F4), C1 to C5 on the screen, against the in-memory store that
 * passes the same contract suite as the SQLite one. C6 to C9 are the store's
 * and the migration's, pinned in the contract suite and in the server.
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

const newStore = (): TaskStore => {
  let n = 0
  return inMemoryTaskStore({ newId: () => `id-${(n += 1)}`, now: () => '2026-11-06T12:00:00.000Z' })
}

const portOver = (store: TaskStore): TasksPort => ({
  boards: () => store.boards(),
  createBoard: (input) => store.createBoard(input),
  updateBoard: (id, patch) => store.updateBoard(id, patch),
  board: (boardId) => store.board(boardId),
  create: (input) => store.create(input),
  update: (key, patch) => store.update(key, patch),
  delete: (key) => store.delete(key),
})

async function mount(store: TaskStore) {
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp(Tasks, { deps: { ...testSharedDeps(), tasks: portOver(store) } })
  app.mount(host)
  await settle()
  return host
}

const switcher = (host: HTMLElement) => host.querySelector<HTMLSelectElement>('select[aria-label="Board"]')
const boardNames = (host: HTMLElement) => [...(switcher(host)?.options ?? [])].map((option) => option.textContent?.trim())
const button = (host: HTMLElement, label: string) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ??
  [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) ??
  null
const column = (host: HTMLElement, name: string) => host.querySelector<HTMLElement>(`section[aria-label="${name}"]`)
const cards = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLElement>('[data-view] li')].map((li) => li.textContent?.replace(/\s+/g, ' ').trim())

function type(field: HTMLInputElement | null, value: string): void {
  if (!field) throw new Error('field not found')
  field.value = value
  field.dispatchEvent(new Event('input'))
}

async function submitBoard(host: HTMLElement, name: string, prefix: string): Promise<HTMLFormElement> {
  button(host, 'Novo board')!.click()
  await settle()
  const form = host.querySelector<HTMLFormElement>('form[aria-label="Novo board"]')!
  type(form.querySelector('input[aria-label="Nome do board"]'), name)
  type(form.querySelector('input[aria-label="Prefixo do board"]'), prefix)
  form.dispatchEvent(new Event('submit', { cancelable: true }))
  await settle()
  return form
}

async function switchTo(host: HTMLElement, name: string): Promise<void> {
  const select = switcher(host)!
  const option = [...select.options].find((candidate) => candidate.textContent?.trim() === name)!
  select.value = option.value
  select.dispatchEvent(new Event('change'))
  await settle()
}

describe('C1: Criar um board', () => {
  it('"Casa" aparece na troca de boards e abre vazio, com os cinco status', async () => {
    const host = await mount(newStore())

    await submitBoard(host, 'Casa', 'CASA')

    expect(boardNames(host)).toEqual(['Tasks', 'Casa'])
    expect(switcher(host)?.selectedOptions[0]?.textContent?.trim()).toBe('Casa')
    expect(host.querySelector('form[aria-label="Novo board"]')).toBeNull()
    for (const name of ['Backlog', 'A fazer', 'Fazendo', 'Feito', 'Cancelado']) expect(column(host, name)).not.toBeNull()
    expect(cards(host)).toEqual([])
  })
})

describe('C2: Prefixo inválido é recusado (J5.1a, RN9)', () => {
  it.each([
    ['', 'o prefixo é obrigatório'],
    ['CA-SA', 'o prefixo usa só letras de A a Z e números'],
    ['CASINHA', 'o prefixo tem no máximo 6 caracteres'],
    ['T', 'o prefixo T já foi usado por um board'],
  ])('o prefixo %j mostra "%s", e a troca continua só com "Tasks"', async (prefix, message) => {
    const host = await mount(newStore())

    const form = await submitBoard(host, 'Casa', prefix)

    expect(form.querySelector('[role="alert"]')?.textContent?.trim()).toBe(message)
    expect(boardNames(host)).toEqual(['Tasks'])
  })

  it('o campo do prefixo põe em maiúsculas ao digitar', async () => {
    const host = await mount(newStore())
    button(host, 'Novo board')!.click()
    await settle()
    const field = host.querySelector<HTMLInputElement>('input[aria-label="Prefixo do board"]')
    type(field, 'casa')
    await settle()
    expect(field?.value).toBe('CASA')
  })
})

describe('C3: Nome vazio é recusado (J5.1b)', () => {
  it('mostra "o nome é obrigatório", e a troca continua só com "Tasks"', async () => {
    const host = await mount(newStore())

    const form = await submitBoard(host, '  ', 'CASA')

    expect(form.querySelector('[role="alert"]')?.textContent?.trim()).toBe('o nome é obrigatório')
    expect(boardNames(host)).toEqual(['Tasks'])
  })
})

describe('C4: Trocar de board mostra só as tarefas dele (J5.2)', () => {
  it('o board e a lista mostram só CASA-1 "Trocar a lâmpada"', async () => {
    const store = newStore()
    const casa = await store.createBoard({ name: 'Casa', prefix: 'CASA' })
    await store.create({ boardId: SEED_BOARD.id, title: 'Pagar o condomínio', statusId: 'todo' })
    await store.create({ boardId: casa.id, title: 'Trocar a lâmpada', statusId: 'todo' })
    const host = await mount(store)
    expect(cards(host)).toEqual([expect.stringContaining('T-1')])

    await switchTo(host, 'Casa')

    expect(cards(host)).toEqual([expect.stringMatching(/CASA-1.*Trocar a lâmpada/)])
    button(host, 'Lista')!.click()
    await settle()
    expect(cards(host)).toEqual([expect.stringMatching(/CASA-1.*Trocar a lâmpada/)])
  })
})

describe('C5: Recarregar volta no último board usado (J5.2)', () => {
  it('o board na tela é "Casa"', async () => {
    const store = newStore()
    await store.createBoard({ name: 'Casa', prefix: 'CASA' })
    const host = await mount(store)
    await switchTo(host, 'Casa')

    app?.unmount()
    document.body.innerHTML = ''
    const reloaded = await mount(store)

    expect(switcher(reloaded)?.selectedOptions[0]?.textContent?.trim()).toBe('Casa')
  })
})

describe('the board is edited in place (J5.4)', () => {
  it('renames and changes the prefix, and a task created after takes the new one', async () => {
    const store = newStore()
    const casa = await store.createBoard({ name: 'Casa', prefix: 'CASA' })
    await store.create({ boardId: casa.id, title: 'um', statusId: 'todo' })
    localStorage.setItem('dailly.tasks.board', casa.id)
    const host = await mount(store)

    button(host, 'Editar board')!.click()
    await settle()
    const form = host.querySelector<HTMLFormElement>('form[aria-label="Editar board"]')!
    expect(form.querySelector<HTMLInputElement>('input[aria-label="Nome do board"]')?.value).toBe('Casa')
    type(form.querySelector('input[aria-label="Nome do board"]'), 'Lar')
    type(form.querySelector('input[aria-label="Prefixo do board"]'), 'LAR')
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    await settle()

    expect(boardNames(host)).toEqual(['Tasks', 'Lar'])
    expect((await store.create({ boardId: casa.id, title: 'dois', statusId: 'todo' })).keyPrefix).toBe('LAR')
    expect(cards(host)).toEqual([expect.stringContaining('CASA-1')])
  })

  it('shows the refusal of a prefix in use and keeps the board as it was', async () => {
    const store = newStore()
    const casa = await store.createBoard({ name: 'Casa', prefix: 'CASA' })
    localStorage.setItem('dailly.tasks.board', casa.id)
    const host = await mount(store)

    button(host, 'Editar board')!.click()
    await settle()
    const form = host.querySelector<HTMLFormElement>('form[aria-label="Editar board"]')!
    type(form.querySelector('input[aria-label="Prefixo do board"]'), 'T')
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    await settle()

    expect(form.querySelector('[role="alert"]')?.textContent?.trim()).toBe('o prefixo T já foi usado por um board')
    expect(await store.boards()).toEqual([SEED_BOARD, casa])
  })
})
