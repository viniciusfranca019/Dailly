// @vitest-environment jsdom
import { SEED_BOARD, type TaskStore } from '@dailly/tasks-core'
import { inMemoryTaskStore } from '@dailly/tasks-core/testing'
import type { ProgramsPort, TasksPort } from '@shared'
import { programsOver, testLabelsPort, testSharedDeps } from '@shared/testing.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, type App } from 'vue'
import Tasks from './Tasks.vue'

/**
 * The program and focus filters on the Tasks screen, C1 to C5. The board
 * "Tasks" holds T-1 "Login" and T-2 "Logout" (Feito) in the program "auth" at
 * P0, T-3 "Cor" in "ui" out of focus, T-4 "Docs" alone at P0 and T-5 "Solta"
 * in nothing.
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

const TITLES = ['Login', 'Logout', 'Cor', 'Docs', 'Solta']

async function world() {
  let n = 0
  const store = inMemoryTaskStore({ newId: () => `id-${(n += 1)}`, now: () => '2026-11-25T12:00:00.000Z' })
  for (const [title, statusId] of [['Login', 'todo'], ['Logout', 'done'], ['Cor', 'doing'], ['Docs', 'todo'], ['Solta', 'todo']]) {
    await store.create({ boardId: SEED_BOARD.id, title: title!, statusId: statusId! })
  }
  const auth = await store.createProgram({ name: 'auth', objective: '', windowStart: null, windowEnd: null, exitWhen: '' })
  const ui = await store.createProgram({ name: 'ui', objective: '', windowStart: null, windowEnd: null, exitWhen: '' })
  await store.addToProgram(auth.id, { prefix: 'T', key: 1 })
  await store.addToProgram(auth.id, { prefix: 'T', key: 2 })
  await store.addToProgram(ui.id, { prefix: 'T', key: 3 })
  await store.setFocus({ program: auth.id }, 'P0')
  await store.setFocus({ task: { prefix: 'T', key: 4 } }, 'P0')
  return store
}

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

async function mount(store: TaskStore, programs: ProgramsPort = programsOver(store)) {
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp(Tasks, { deps: { ...testSharedDeps(), tasks: tasksOver(store), labels: testLabelsPort(), programs } })
  app.mount(host)
  await settle()
  return host
}

const group = (host: HTMLElement, name: string) => host.querySelector<HTMLElement>(`[role="group"][aria-label="${name}"]`)
const visible = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLElement>('[data-view] li')]
    .flatMap((li) => TITLES.filter((title) => li.textContent?.includes(title)))
    .sort()
const buttonNamed = (host: HTMLElement, name: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === name) ?? null

async function toggle(host: HTMLElement, filter: string, name: string): Promise<void> {
  ;[...group(host, filter)!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === name)!.click()
  await settle()
}

async function click(host: HTMLElement, name: string): Promise<void> {
  buttonNamed(host, name)!.click()
  await settle()
}

describe('C1: ligar um programa mostra só as tarefas dele, com todos os status', () => {
  it('no board e na lista ficam Login e Logout', async () => {
    const host = await mount(await world())

    await toggle(host, 'Filtrar por programa', 'auth')

    expect(visible(host)).toEqual(['Login', 'Logout'])
    expect(group(host, 'Filtrar por programa')!.querySelector('[aria-pressed="true"]')?.textContent?.trim()).toBe('auth')
    await click(host, 'Lista')
    expect(visible(host)).toEqual(['Login', 'Logout'])
  })

  it('dois programas somam (OU)', async () => {
    const host = await mount(await world())

    await toggle(host, 'Filtrar por programa', 'auth')
    await toggle(host, 'Filtrar por programa', 'ui')

    expect(visible(host)).toEqual(['Cor', 'Login', 'Logout'])
  })
})

describe('C2: ligar P0 mostra as tarefas dos programas e as avulsas em P0, sem as concluídas', () => {
  it('ficam Login e Docs; Logout, Feito, sai', async () => {
    const host = await mount(await world())

    await toggle(host, 'Filtrar por foco', 'P0')

    expect(visible(host)).toEqual(['Docs', 'Login'])
  })
})

describe('C3: programa e foco juntos mostram o que passa nos dois', () => {
  it('ui e P0 não deixam nada; auth e P0 deixam Login', async () => {
    const host = await mount(await world())

    await toggle(host, 'Filtrar por programa', 'ui')
    await toggle(host, 'Filtrar por foco', 'P0')
    expect(visible(host)).toEqual([])

    await toggle(host, 'Filtrar por programa', 'auth')
    await toggle(host, 'Filtrar por programa', 'ui')
    expect(visible(host)).toEqual(['Login'])
  })
})

describe('C4: um filtro que esconde tudo diz isso, e "Limpar filtro" desliga os três', () => {
  it('P2 vazio, depois limpar', async () => {
    const host = await mount(await world())
    await toggle(host, 'Filtrar por programa', 'auth')
    await toggle(host, 'Filtrar por foco', 'P2')

    expect(visible(host)).toEqual([])
    expect(host.textContent).toContain('nenhuma tarefa com esse filtro')

    await click(host, 'Limpar filtro')
    expect(visible(host)).toEqual(['Cor', 'Docs', 'Login', 'Logout', 'Solta'])
    expect(group(host, 'Filtrar por programa')!.querySelector('[aria-pressed="true"]')).toBeNull()
    expect(group(host, 'Filtrar por foco')!.querySelector('[aria-pressed="true"]')).toBeNull()
    expect(buttonNamed(host, 'Limpar filtro')).toBeNull()
  })
})

describe('C5: uma leitura que falha deixa o board e diz o erro no lugar dos chips', () => {
  it('sem programas nem foco, o board aparece inteiro e cada filtro diz que falhou', async () => {
    const store = await world()
    const broken: ProgramsPort = {
      ...programsOver(store),
      programs: () => Promise.reject(new Error('sem rede')),
      focus: () => Promise.reject(new Error('sem rede')),
    }
    const host = await mount(store, broken)

    expect(visible(host)).toEqual(['Cor', 'Docs', 'Login', 'Logout', 'Solta'])
    expect(group(host, 'Filtrar por programa')).toBeNull()
    expect(group(host, 'Filtrar por foco')).toBeNull()
    expect(host.textContent).toContain('não consegui ler os programas')
    expect(host.textContent).toContain('não consegui ler o foco')
  })

  it('o chip de um nível vazio continua lá', async () => {
    const host = await mount(await world())
    const levels = [...group(host, 'Filtrar por foco')!.querySelectorAll('button')].map((b) => b.textContent?.trim())
    expect(levels).toEqual(['P0', 'P1', 'P2'])
  })
})
