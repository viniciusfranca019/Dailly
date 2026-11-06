// @vitest-environment jsdom
import { TEXT_ATTR } from '@capabilities/whiteboard/dom'
import type { TaskStore } from '@dailly/tasks-core'
import { inMemoryTaskStore } from '@dailly/tasks-core/testing'
import type { TasksPort } from '@shared'
import { testSharedDeps } from '@shared/testing.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, type App } from 'vue'
import Tasks from './Tasks.vue'

/** Card #22, C1 to C8: the task panel. */
const settle = async () => {
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

let app: App | undefined
beforeEach(() => localStorage.clear())
afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
})

const storeWith = async (seed: readonly [string, string][]): Promise<TaskStore> => {
  let n = 0
  const store = inMemoryTaskStore({ newId: () => `id-${(n += 1)}`, now: () => '2026-11-05T12:00:00.000Z' })
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
  addStatus: (boardId, input) => store.addStatus(boardId, input),
  updateStatus: (id, patch) => store.updateStatus(id, patch),
  deleteStatus: (id, moveTo) => store.deleteStatus(id, moveTo),
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

const column = (host: HTMLElement, name: string) => host.querySelector<HTMLElement>(`section[aria-label="${name}"]`)
const card = (host: HTMLElement, key: string) =>
  [...host.querySelectorAll<HTMLElement>('section li')].find((li) => li.textContent?.includes(key))
const keysIn = (section: HTMLElement | null) =>
  [...(section?.querySelectorAll<HTMLElement>('li') ?? [])].map((li) => /T-\d+/.exec(li.textContent ?? '')?.[0])
const panel = (host: HTMLElement) => host.querySelector<HTMLElement>('[role="dialog"]')
const field = <T extends HTMLElement>(host: HTMLElement, label: string) =>
  panel(host)!.querySelector<T>(`[aria-label="${label}"]`)!
const button = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label)!
const viewButton = (host: HTMLElement, label: string) => button(host.querySelector('nav')!, label)

async function open(host: HTMLElement, key: string) {
  card(host, key)!.click()
  await settle()
}

function set(element: HTMLInputElement | HTMLSelectElement, value: string) {
  element.value = value
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input'))
}

async function save(host: HTMLElement) {
  panel(host)!.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))
  await settle()
}

describe('C1: abrir o painel', () => {
  it('mostra título, status, prioridade e o corpo no editor de blocos', async () => {
    const store = await storeWith([['Comprar café', 'todo']])
    await store.update({ prefix: 'T', key: 1 }, { body: 'moído fino' })
    const host = await mount(portOver(store))

    await open(host, 'T-1')

    expect(panel(host)?.getAttribute('aria-label')).toBe('T-1')
    expect(field<HTMLInputElement>(host, 'Título').value).toBe('Comprar café')
    expect(field<HTMLSelectElement>(host, 'Status').value).toBe('todo')
    expect(field<HTMLSelectElement>(host, 'Prioridade').value).toBe('0')
    expect(panel(host)!.querySelector(`[${TEXT_ATTR}]`)?.textContent).toBe('moído fino')
  })

  it('abre também pela linha da lista', async () => {
    localStorage.setItem('dailly.tasks.view', 'list')
    const host = await mount(portOver(await storeWith([['Comprar café', 'todo']])))

    await open(host, 'T-1')

    expect(panel(host)?.getAttribute('aria-label')).toBe('T-1')
  })
})

describe('C2: editar e salvar', () => {
  it('o card e a linha mostram o título novo e a prioridade "alta"', async () => {
    const host = await mount(portOver(await storeWith([['Comprar café', 'todo']])))
    await open(host, 'T-1')

    set(field<HTMLInputElement>(host, 'Título'), 'Comprar café especial')
    set(field<HTMLSelectElement>(host, 'Prioridade'), '2')
    await save(host)

    expect(card(host, 'T-1')?.textContent).toContain('Comprar café especial')
    expect(card(host, 'T-1')?.textContent).toContain('Prioridade: alta')
    viewButton(host, 'Lista').click()
    await settle()
    expect(card(host, 'T-1')?.textContent).toContain('Comprar café especial')
    expect(card(host, 'T-1')?.textContent).toContain('Prioridade: alta')
  })

  it('salva também o corpo escrito no editor, e pelo botão', async () => {
    const store = await storeWith([['Comprar café', 'todo']])
    const host = await mount(portOver(store))
    await open(host, 'T-1')

    const block = panel(host)!.querySelector<HTMLElement>(`[${TEXT_ATTR}]`)!
    block.textContent = 'moído fino'
    block.dispatchEvent(new Event('input', { bubbles: true }))
    button(panel(host)!, 'Salvar').click()
    await settle()

    expect((await store.board('tasks'))!.tasks[0]?.body).toBe('moído fino')
  })
})

describe('C3: título apagado é recusado', () => {
  it('diz "o título é obrigatório" e T-1 continua com o título anterior', async () => {
    let calls = 0
    const store = await storeWith([['Comprar café', 'todo']])
    const host = await mount(
      portOver(store, {
        update: async (key, patch) => {
          calls += 1
          return store.update(key, patch)
        },
      }),
    )
    await open(host, 'T-1')

    set(field<HTMLInputElement>(host, 'Título'), '   ')
    await save(host)

    expect(panel(host)!.querySelector('[role="alert"]')?.textContent).toContain('o título é obrigatório')
    expect(calls).toBe(0)
    expect(card(host, 'T-1')?.textContent).toContain('Comprar café')
  })
})

describe('C4: apagar com confirmação', () => {
  it('T-1 some do board e da lista', async () => {
    const host = await mount(portOver(await storeWith([['Comprar café', 'todo'], ['Outra', 'todo']])))
    await open(host, 'T-1')

    button(panel(host)!, 'Apagar').click()
    await settle()
    button(host.querySelector('[role="alertdialog"]')!, 'Apagar').click()
    await settle()

    expect(panel(host)).toBeNull()
    expect(card(host, 'T-1')).toBeUndefined()
    viewButton(host, 'Lista').click()
    await settle()
    expect(card(host, 'T-1')).toBeUndefined()
    expect(card(host, 'T-2')).toBeDefined()
  })
})

describe('C5: cancelar a confirmação não apaga', () => {
  it('T-1 continua onde estava', async () => {
    const store = await storeWith([['Comprar café', 'todo']])
    const host = await mount(portOver(store))
    await open(host, 'T-1')

    button(panel(host)!, 'Apagar').click()
    await settle()
    button(host.querySelector('[role="alertdialog"]')!, 'Cancelar').click()
    await settle()

    expect(host.querySelector('[role="alertdialog"]')).toBeNull()
    expect(panel(host)).not.toBeNull()
    expect(keysIn(column(host, 'A fazer'))).toEqual(['T-1'])
    expect((await store.board('tasks'))!.tasks).toHaveLength(1)
  })
})

describe('C6: tarefa que não existe mais', () => {
  it('ao salvar, diz "tarefa não encontrada" com o caminho de volta ao board', async () => {
    const store = await storeWith([['Comprar café', 'todo']])
    const host = await mount(portOver(store))
    await open(host, 'T-1')
    await store.delete({ prefix: 'T', key: 1 })

    await save(host)

    expect(panel(host)!.textContent).toContain('tarefa não encontrada')
    button(panel(host)!, 'Voltar ao board').click()
    await settle()
    expect(panel(host)).toBeNull()
    expect(card(host, 'T-1')).toBeUndefined()
  })
})

describe('C7: gravação recusada no painel volta ao que o servidor tem (RN7)', () => {
  it('mostra a mensagem do erro, e o card continua com a prioridade anterior', async () => {
    const host = await mount(
      portOver(await storeWith([['Comprar café', 'todo']]), {
        update: async () => {
          throw new Error('a API recusou a requisição')
        },
      }),
    )
    await open(host, 'T-1')

    set(field<HTMLSelectElement>(host, 'Prioridade'), '2')
    await save(host)

    expect(panel(host)!.querySelector('[role="alert"]')?.textContent).toContain('a API recusou a requisição')
    expect(card(host, 'T-1')?.textContent).toContain('Prioridade: sem')
  })
})

describe('C8: mudar o status pelo painel', () => {
  it('T-1 aparece no topo de "Fazendo", no board e na lista', async () => {
    const host = await mount(portOver(await storeWith([['Comprar café', 'todo'], ['Antiga', 'doing']])))
    await open(host, 'T-1')

    set(field<HTMLSelectElement>(host, 'Status'), 'doing')
    await save(host)

    expect(keysIn(column(host, 'Fazendo'))).toEqual(['T-1', 'T-2'])
    viewButton(host, 'Lista').click()
    await settle()
    expect(keysIn(column(host, 'Fazendo'))).toEqual(['T-1', 'T-2'])
  })
})

describe('gate #22: o painel pelo teclado', () => {
  it('o card e a linha têm um botão focável com o título, que abre o painel', async () => {
    const host = await mount(portOver(await storeWith([['Comprar café', 'todo']])))

    for (const view of ['Board', 'Lista']) {
      viewButton(host, view).click()
      await settle()
      const opener = card(host, 'T-1')!.querySelector<HTMLButtonElement>('button')
      expect(opener?.textContent).toContain('Comprar café')
      opener!.click()
      await settle()
      expect(panel(host)?.getAttribute('aria-label')).toBe('T-1')
      button(panel(host)!, 'Fechar').click()
      await settle()
    }
  })

  it('ao abrir, o foco vai para o título do painel', async () => {
    const host = await mount(portOver(await storeWith([['Comprar café', 'todo']])))
    await open(host, 'T-1')

    expect(document.activeElement).toBe(field(host, 'Título'))
  })

  it('Ctrl+S salva e Esc fecha com o foco fora do painel', async () => {
    const store = await storeWith([['Comprar café', 'todo']])
    const host = await mount(portOver(store))
    await open(host, 'T-1')
    set(field<HTMLSelectElement>(host, 'Prioridade'), '2')
    ;(document.activeElement as HTMLElement | null)?.blur()

    const ctrlS = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })
    window.dispatchEvent(ctrlS)
    await settle()
    expect(ctrlS.defaultPrevented).toBe(true)
    expect((await store.board('tasks'))!.tasks[0]?.priority).toBe(2)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(panel(host)).toBeNull()
  })

  it('Esc dentro do editor de blocos não fecha o painel', async () => {
    const host = await mount(portOver(await storeWith([['Comprar café', 'todo']])))
    await open(host, 'T-1')

    const block = panel(host)!.querySelector<HTMLElement>(`[${TEXT_ATTR}]`)!
    block.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()

    expect(panel(host)).not.toBeNull()
  })
})

describe('C7, na lista também', () => {
  it('a linha continua com a prioridade anterior depois da recusa', async () => {
    localStorage.setItem('dailly.tasks.view', 'list')
    const host = await mount(
      portOver(await storeWith([['Comprar café', 'todo']]), {
        update: async () => {
          throw new Error('a API recusou a requisição')
        },
      }),
    )
    await open(host, 'T-1')
    set(field<HTMLSelectElement>(host, 'Prioridade'), '2')
    await save(host)

    expect(card(host, 'T-1')?.textContent).toContain('Prioridade: sem')
  })
})

describe('gate #22, rodada 2: um Esc de outro controle é desse controle', () => {
  it('cancelar a captura com Esc não fecha o painel nem perde o rascunho', async () => {
    const host = await mount(portOver(await storeWith([['Comprar café', 'todo']])))
    await open(host, 'T-1')
    set(field<HTMLSelectElement>(host, 'Prioridade'), '2')

    button(column(host, 'Fazendo')!, '+').click()
    await settle()
    const capture = host.querySelector<HTMLInputElement>('input[aria-label="Título da nova tarefa"]')!
    capture.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()

    expect(host.querySelector('input[aria-label="Título da nova tarefa"]')).toBeNull()
    expect(panel(host)).not.toBeNull()
    expect(field<HTMLSelectElement>(host, 'Prioridade').value).toBe('2')
  })
})
