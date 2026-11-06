// @vitest-environment jsdom
import { SEED_BOARD, type TaskStore } from '@dailly/tasks-core'
import { inMemoryTaskStore } from '@dailly/tasks-core/testing'
import type { TasksPort } from '@shared'
import { testSharedDeps } from '@shared/testing.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, type App } from 'vue'
import { requestOpen, takeOpen } from '../model/open-request.js'
import TaskSearch from './search/TaskSearch.vue'
import Tasks from './Tasks.vue'

/**
 * Card #47 (F9), the search itself: C4 to C6, and choosing a result. C1 to C3
 * are the shell's seam (`shell/commands.test.ts`); C7 across the shell is in
 * `shell/tasks-search.test.ts`.
 */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const settle = async () => {
  await wait(200)
  for (let n = 0; n < 4; n += 1) await wait(0)
}

let app: App | undefined
afterEach(() => {
  // A choice leaves a request for a Tasks screen that this file may not mount.
  takeOpen()
  localStorage.clear()
  app?.unmount()
  document.body.innerHTML = ''
})

async function seeded(): Promise<{ store: TaskStore; casa: string }> {
  let n = 0
  const store = inMemoryTaskStore({ newId: () => `id-${(n += 1)}`, now: () => '2026-11-06T12:00:00.000Z' })
  const casa = (await store.createBoard({ name: 'Casa', prefix: 'CASA' })).id
  const todo = (await store.board(casa))!.statuses.find((status) => status.name === 'A fazer')!.id
  for (const title of ['Café da manhã de domingo', 'dois', 'Trocar a lâmpada']) await store.create({ boardId: casa, title, statusId: todo })
  await store.updateBoard(casa, { prefix: 'LAR' })
  for (const title of ['Comprar café', 'dois', 'Pagar o condomínio']) {
    await store.create({ boardId: SEED_BOARD.id, title, statusId: 'todo' })
  }
  return { store, casa }
}

function mountSearch(tasks: Partial<TasksPort> & Pick<TasksPort, 'search'>) {
  const calls = { navigate: [] as string[], closed: 0 }
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp(TaskSearch, {
    deps: { ...testSharedDeps(), tasks },
    focusTick: 0,
    navigate: (route: string) => calls.navigate.push(route),
    close: () => (calls.closed += 1),
  })
  app.mount(host)
  return { host, calls }
}

const field = (host: HTMLElement) => host.querySelector<HTMLInputElement>('input[aria-label="Buscar tarefa"]')!
const options = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLElement>('[role="option"]')].map((option) => option.textContent?.replace(/\s+/g, ' ').trim())

async function type(host: HTMLElement, text: string): Promise<void> {
  field(host).value = text
  field(host).dispatchEvent(new Event('input'))
  await settle()
}

describe('C4: Achar pela chave (J10.2, RN5)', () => {
  it('"casa-3" mostra só CASA-3 "Trocar a lâmpada", com o board "Casa"', async () => {
    const { store } = await seeded()
    const { host } = mountSearch({ search: (text) => store.search(text) })
    expect(document.activeElement).toBe(field(host))

    await type(host, 'casa-3')

    expect(options(host)).toEqual([expect.stringMatching(/CASA-3.*Trocar a lâmpada.*Casa/)])
  })
})

describe('C5: Achar por parte do título, em todos os boards (J10.2)', () => {
  it('"café" mostra as duas, cada uma com o seu board', async () => {
    const { store } = await seeded()
    const { host } = mountSearch({ search: (text) => store.search(text) })

    await type(host, 'café')

    expect(options(host)).toEqual([
      expect.stringMatching(/T-1.*Comprar café.*Tasks/),
      expect.stringMatching(/CASA-1.*Café da manhã de domingo.*Casa/),
    ])
  })
})

describe('C6: Nada bate (J10.2a)', () => {
  it('"orçamento" mostra "nenhuma tarefa encontrada"', async () => {
    const { store } = await seeded()
    const { host } = mountSearch({ search: (text) => store.search(text) })

    await type(host, 'orçamento')

    expect(options(host)).toEqual([])
    expect(host.textContent).toContain('nenhuma tarefa encontrada')
  })
})

describe('#47: o que a busca faz enquanto se digita', () => {
  it('não chama a API com o campo vazio, espera as teclas, e descarta a resposta de um texto que mudou', async () => {
    const { store } = await seeded()
    const asked: string[] = []
    const { host } = mountSearch({
      search: async (text) => {
        asked.push(text)
        if (text === 'caf') await wait(300)
        return store.search(text)
      },
    })

    await type(host, '   ')
    expect(asked).toEqual([])

    field(host).value = 'c'
    field(host).dispatchEvent(new Event('input'))
    field(host).value = 'caf'
    field(host).dispatchEvent(new Event('input'))
    await settle()
    field(host).value = 'lâmpada'
    field(host).dispatchEvent(new Event('input'))
    await settle()
    await wait(300)

    expect(asked).toEqual(['caf', 'lâmpada'])
    expect(options(host)).toEqual([expect.stringContaining('Trocar a lâmpada')])
  })

  it('mostra o erro dentro da busca, com o texto mantido', async () => {
    const { host } = mountSearch({
      search: async () => {
        throw new Error('não consegui falar com a API local')
      },
    })

    await type(host, 'café')

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('não consegui falar com a API local')
    expect(field(host).value).toBe('café')
  })

  it('↓ e Enter escolhem: o board vira o último usado, e a busca vai ao Tasks e fecha', async () => {
    const { store, casa } = await seeded()
    const { host, calls } = mountSearch({ search: (text) => store.search(text) })
    await type(host, 'café')

    field(host).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await settle()
    expect(host.querySelector('[aria-selected="true"]')?.textContent).toContain('CASA-1')
    field(host).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await settle()

    expect(localStorage.getItem('dailly.tasks.board')).toBe(casa)
    expect(calls).toEqual({ navigate: ['/tasks'], closed: 1 })
  })

  it('Esc fecha', async () => {
    const { host, calls } = mountSearch({ search: async () => [] })
    field(host).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(calls.closed).toBe(1)
  })
})

describe('gate #47: a request to open that cannot read the boards', () => {
  it('shows the failure on the Tasks screen instead of losing it', async () => {
    const { store, casa } = await seeded()
    let failing = false
    const port = {
      ...Object.fromEntries(
        ['boards', 'createBoard', 'updateBoard', 'board', 'create', 'update', 'delete', 'comments', 'addComment', 'addStatus', 'updateStatus', 'deleteStatus', 'search'].map((name) => [
          name,
          (...args: unknown[]) => (store as unknown as Record<string, (...a: unknown[]) => unknown>)[name]!(...args),
        ]),
      ),
      deleteComment: async () => true,
      boards: async () => {
        if (failing) throw new Error('não consegui falar com a API local')
        return store.boards()
      },
    } as unknown as TasksPort
    const host = document.createElement('div')
    document.body.append(host)
    app = createApp(Tasks, { deps: { ...testSharedDeps(), tasks: port } })
    app.mount(host)
    await settle()

    failing = true
    requestOpen({ boardId: casa, prefix: 'CASA', key: 3 })
    await settle()

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('não consegui falar com a API local')
  })
})
