// @vitest-environment jsdom
import type { TaskStore } from '@dailly/tasks-core'
import { inMemoryTaskStore } from '@dailly/tasks-core/testing'
import type { TasksPort } from '@shared'
import { programsOver, testSharedDeps } from '@shared/testing.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, type App } from 'vue'
import Tasks from './Tasks.vue'

/** LAB-9, C1 to C7: the Programas and Foco views, and the program in the task panel. */
const settle = async () => {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

let app: App | undefined
beforeEach(() => localStorage.clear())
afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
})

const tasksOver = (store: TaskStore): TasksPort => ({
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

/** Boards Labs (LAB-1..8) and VDT (VDT-1..2). */
async function world() {
  let n = 0
  const store = inMemoryTaskStore({ newId: () => `id-${(n += 1)}`, now: () => '2026-11-25T12:00:00.000Z' })
  for (const [name, prefix, count] of [['Labs', 'LAB', 8], ['VDT', 'VDT', 2]] as const) {
    const board = await store.createBoard({ name, prefix })
    const statusId = (await store.board(board.id))!.statuses[1]!.id
    for (let k = 1; k <= count; k += 1) await store.create({ boardId: board.id, title: `${prefix} ${k}`, statusId })
  }
  return store
}

async function mount(store: TaskStore) {
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp(Tasks, { deps: { ...testSharedDeps(), tasks: tasksOver(store), programs: programsOver(store) } })
  app.mount(host)
  await settle()
  return host
}

const button = (root: Element, label: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label,
  )!
const labeled = <T extends HTMLElement>(root: Element, label: string) => root.querySelector<T>(`[aria-label="${label}"]`)!
function set(element: HTMLInputElement | HTMLSelectElement, value: string) {
  element.value = value
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input'))
}
async function submit(form: HTMLFormElement) {
  form.dispatchEvent(new Event('submit', { cancelable: true }))
  await settle()
}
async function show(host: HTMLElement, view: 'Programas' | 'Foco') {
  button(labeled(host, 'Visualização'), view).click()
  await settle()
}
const programCard = (host: HTMLElement, name: string) => labeled(host, `Programa ${name}`)
const level = (host: HTMLElement, name: 'P0' | 'P1' | 'P2') =>
  [...labeled(host, `Foco ${name}`).querySelectorAll('li')].map((li) => li.querySelector('[data-focus-item]')?.textContent?.trim())

async function createProgram(host: HTMLElement, fields: Record<string, string>) {
  button(host, 'Novo programa').click()
  await settle()
  const form = labeled<HTMLFormElement>(host, 'Novo programa')
  for (const [label, value] of Object.entries(fields)) set(labeled<HTMLInputElement>(form, label), value)
  await submit(form)
  return form
}
async function addTask(host: HTMLElement, program: string, key: string) {
  const card = programCard(host, program)
  set(labeled<HTMLInputElement>(card, `Tarefa para ${program}`), key)
  await submit(card.querySelector('form')!)
}

const DAILLY = {
  Nome: 'Dailly v1',
  Objetivo: 'fechar a v1',
  'Início da janela': '2026-11-25',
  'Fim da janela': '2026-12-19',
  'Sai quando': 'os cards dailly v1 em Done',
}

describe('C1: Criar um programa', () => {
  it('"Dailly v1" aparece na visão Programas, com objetivo, janela e "sai quando", e sem tarefas', async () => {
    const host = await mount(await world())
    await show(host, 'Programas')

    await createProgram(host, DAILLY)

    const card = programCard(host, 'Dailly v1')
    expect(card.textContent).toContain('fechar a v1')
    expect(card.textContent).toContain('25/11/2026 a 19/12/2026')
    expect(card.textContent).toContain('os cards dailly v1 em Done')
    expect(card.textContent).toContain('sem tarefas')
  })
})

describe('C2: Janela invertida é recusada', () => {
  it('diz "o fim da janela vem depois do início", e o formulário guarda o que foi digitado', async () => {
    const store = await world()
    const host = await mount(store)
    await show(host, 'Programas')

    const form = await createProgram(host, { ...DAILLY, 'Início da janela': '2026-12-19', 'Fim da janela': '2026-11-25' })

    expect(form.querySelector('[role="alert"]')?.textContent?.trim()).toBe('o fim da janela vem depois do início')
    expect(labeled<HTMLInputElement>(form, 'Nome').value).toBe('Dailly v1')
    expect(labeled<HTMLInputElement>(form, 'Fim da janela').value).toBe('2026-11-25')
    expect(await store.programs()).toEqual([])
  })
})

describe('C3: Tarefas de boards diferentes entram num programa', () => {
  it('o programa lista LAB-5 e VDT-2 com chave, título e status, e o painel de cada uma mostra "Dailly v1"', async () => {
    const store = await world()
    const host = await mount(store)
    await show(host, 'Programas')
    await createProgram(host, DAILLY)

    await addTask(host, 'Dailly v1', 'LAB-5')
    await addTask(host, 'Dailly v1', 'vdt-2')

    const rows = [...programCard(host, 'Dailly v1').querySelectorAll('li')].map((li) =>
      [...li.children].map((cell) => cell.textContent?.trim()).join(' '),
    )
    const todo = (await store.board((await store.boards())[1]!.id))!.statuses[1]!.name
    expect(rows).toEqual([`LAB-5 LAB 5 ${todo}`, `VDT-2 VDT 2 ${todo}`])

    button(programCard(host, 'Dailly v1'), 'LAB-5').click()
    await settle()
    expect(labeled(host, 'Programa da tarefa').textContent?.trim()).toBe('Dailly v1')
  })
})

describe('C4: Uma tarefa fica em um programa só', () => {
  it('diz "LAB-5 já está no programa Dailly v1", e LAB-5 continua só no "Dailly v1"', async () => {
    const store = await world()
    const host = await mount(store)
    await show(host, 'Programas')
    await createProgram(host, DAILLY)
    await createProgram(host, { Nome: 'Outro' })
    await addTask(host, 'Dailly v1', 'LAB-5')

    await addTask(host, 'Outro', 'LAB-5')

    expect(programCard(host, 'Outro').querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'LAB-5 já está no programa Dailly v1',
    )
    expect(programCard(host, 'Outro').textContent).toContain('sem tarefas')
    expect((await store.programs())[0]?.tasks.map((task) => task.key)).toEqual(['LAB-5'])
  })
})

describe('C5: Programa e tarefa avulsa entram em foco', () => {
  it('a visão Foco mostra "Dailly v1" em P0 e LAB-8 em P1, e LAB-5 mostra "foco P0 · Dailly v1"', async () => {
    const store = await world()
    const host = await mount(store)
    await show(host, 'Programas')
    await createProgram(host, DAILLY)
    await addTask(host, 'Dailly v1', 'LAB-5')

    set(labeled<HTMLSelectElement>(programCard(host, 'Dailly v1'), 'Foco de Dailly v1'), 'P0')
    await settle()
    await show(host, 'Foco')
    const form = labeled<HTMLFormElement>(host, 'Pôr tarefa em foco')
    set(labeled<HTMLInputElement>(form, 'Chave da tarefa'), 'LAB-8')
    set(labeled<HTMLSelectElement>(form, 'Nível'), 'P1')
    await submit(form)

    expect(level(host, 'P0')).toEqual(['Dailly v1'])
    expect(level(host, 'P1')).toEqual(['LAB-8 LAB 8'])
    await show(host, 'Programas')
    button(programCard(host, 'Dailly v1'), 'LAB-5').click()
    await settle()
    expect(labeled(host, 'Programa da tarefa').textContent?.trim()).toBe('foco P0 · Dailly v1')
  })
})

describe('C6: Tarefa de programa não entra no foco sozinha', () => {
  it('diz "LAB-5 é do programa Dailly v1: ponha o programa em foco"', async () => {
    const store = await world()
    const host = await mount(store)
    await show(host, 'Programas')
    await createProgram(host, DAILLY)
    await addTask(host, 'Dailly v1', 'LAB-5')
    await show(host, 'Foco')

    const form = labeled<HTMLFormElement>(host, 'Pôr tarefa em foco')
    set(labeled<HTMLInputElement>(form, 'Chave da tarefa'), 'LAB-5')
    set(labeled<HTMLSelectElement>(form, 'Nível'), 'P0')
    await submit(form)

    expect(form.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'LAB-5 é do programa Dailly v1: ponha o programa em foco',
    )
    expect(level(host, 'P0')).toEqual([])
  })
})

describe('C7: Tirar do foco', () => {
  it('"Dailly v1" some da visão Foco e continua na visão Programas, com as tarefas', async () => {
    const store = await world()
    const host = await mount(store)
    await show(host, 'Programas')
    await createProgram(host, DAILLY)
    await addTask(host, 'Dailly v1', 'LAB-5')
    set(labeled<HTMLSelectElement>(programCard(host, 'Dailly v1'), 'Foco de Dailly v1'), 'P0')
    await settle()
    await show(host, 'Foco')

    button(labeled(host, 'Foco P0'), 'Tirar Dailly v1 do foco').click()
    await settle()

    expect(level(host, 'P0')).toEqual([])
    await show(host, 'Programas')
    expect(programCard(host, 'Dailly v1').textContent).toContain('LAB-5')
    expect(labeled<HTMLSelectElement>(programCard(host, 'Dailly v1'), 'Foco de Dailly v1').value).toBe('')
  })
})
