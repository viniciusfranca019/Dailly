// @vitest-environment jsdom
import { inMemoryTaskStore } from '@dailly/tasks-core/testing'
import type { TaskStore } from '@dailly/tasks-core'
import type { TasksPort } from '@shared'
import { testSharedDeps } from '@shared/testing.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, type App } from 'vue'
import Tasks from './Tasks.vue'

/**
 * Card #20, C1 to C6, against a fake port over the in-memory store, the one
 * that passes the same contract suite as the SQLite store.
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

let app: App | undefined
afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
})

const storeWith = async (seed: readonly [string, string][] = []): Promise<TaskStore> => {
  let n = 0
  const store = inMemoryTaskStore({ newId: () => `id-${(n += 1)}`, now: () => '2026-11-05T12:00:00.000Z' })
  for (const [title, statusId] of seed) await store.create({ title, statusId })
  return store
}

const portOver = (store: TaskStore, over: Partial<TasksPort> = {}): TasksPort => ({
  board: () => store.board(),
  create: (input) => store.create(input),
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

const group = (host: HTMLElement, name: string) =>
  host.querySelector<HTMLElement>(`section[aria-label="${name}"]`)
const rows = (section: HTMLElement | null) =>
  [...(section?.querySelectorAll<HTMLElement>('li') ?? [])].map((li) => li.textContent?.replace(/\s+/g, ' ').trim())
const button = (host: HTMLElement, label: string) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ??
  [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) ??
  null
const titleField = (host: HTMLElement) => host.querySelector<HTMLInputElement>('input[aria-label="Título da nova tarefa"]')

async function typeAndConfirm(host: HTMLElement, value: string): Promise<void> {
  const input = titleField(host)!
  input.value = value
  input.dispatchEvent(new Event('input'))
  input.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
  await settle()
  await settle()
}

describe('C1: as tarefas aparecem agrupadas por status', () => {
  it('mostra cada tarefa sob o seu status, na lista', async () => {
    const host = await mount(portOver(await storeWith([['Comprar café', 'todo'], ['Ligar pro banco', 'doing']])))

    expect(rows(group(host, 'A fazer'))).toEqual([expect.stringContaining('Comprar café')])
    expect(rows(group(host, 'Fazendo'))).toEqual([expect.stringContaining('Ligar pro banco')])
    expect(group(host, 'A fazer')?.querySelector('header')?.textContent).toContain('1')
    expect(group(host, 'Backlog')?.querySelector('header')?.textContent).toContain('0')
  })
})

describe('C2: sem tarefa, a tela convida a criar', () => {
  it('mostra o estado vazio com o convite para criar a primeira', async () => {
    const host = await mount(portOver(await storeWith()))

    expect(host.textContent).toContain('Nenhuma tarefa ainda')
    expect(group(host, 'A fazer')).toBeNull()

    button(host, 'Criar a primeira tarefa')!.click()
    await settle()
    expect(group(host, 'A fazer')?.contains(titleField(host))).toBe(true)
  })
})

describe('C3: criar uma tarefa por título', () => {
  it('põe "Comprar café" no topo de "A fazer", com a chave e prioridade "sem"', async () => {
    const host = await mount(portOver(await storeWith([['Antiga', 'todo']])))

    button(host, 'Nova tarefa em A fazer')!.click()
    await settle()
    await typeAndConfirm(host, 'Comprar café')

    const [first, second] = rows(group(host, 'A fazer'))
    expect(first).toContain('T-2')
    expect(first).toContain('Comprar café')
    expect(first).toContain('Prioridade: sem')
    expect(second).toContain('Antiga')
    expect(titleField(host)).toBeNull()
  })
})

describe('C4: a chave não é reaproveitada (RN5)', () => {
  it('dá T-3 depois de T-2 apagada pela API', async () => {
    const store = await storeWith([['um', 'todo'], ['dois', 'todo']])
    await store.delete(2)
    const host = await mount(portOver(store))

    button(host, 'Nova tarefa em A fazer')!.click()
    await settle()
    await typeAndConfirm(host, 'três')

    expect(rows(group(host, 'A fazer'))[0]).toContain('T-3')
  })
})

describe('C5: título vazio é recusado', () => {
  it('diz "o título é obrigatório" e não grava nada', async () => {
    let calls = 0
    const store = await storeWith()
    const host = await mount(
      portOver(store, {
        create: async (input) => {
          calls += 1
          return store.create(input)
        },
      }),
    )
    button(host, 'Criar a primeira tarefa')!.click()
    await settle()

    for (const value of ['', '   ']) {
      await typeAndConfirm(host, value)
      expect(host.querySelector('[role="alert"]')?.textContent).toContain('o título é obrigatório')
    }
    expect(calls).toBe(0)
    expect((await store.board()).tasks).toEqual([])
  })
})

describe('C6: a API fora não perde o que foi digitado', () => {
  it('mostra o erro junto do campo e mantém "Comprar café" nele', async () => {
    const host = await mount(
      portOver(await storeWith(), {
        create: async () => {
          throw new Error('não consegui falar com a API local')
        },
      }),
    )
    button(host, 'Criar a primeira tarefa')!.click()
    await settle()

    await typeAndConfirm(host, 'Comprar café')

    const form = titleField(host)!.closest('form')!
    expect(form.querySelector('[role="alert"]')?.textContent).toContain('não consegui falar com a API local')
    expect(titleField(host)!.value).toBe('Comprar café')
  })
})

describe('the read of the board', () => {
  it('says so when the board cannot be read, instead of claiming it is empty', async () => {
    const host = await mount(
      portOver(await storeWith(), {
        board: async () => {
          throw new Error('não consegui falar com a API local')
        },
      }),
    )
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('não consegui falar com a API local')
    expect(host.textContent).not.toContain('Nenhuma tarefa ainda')
  })
})
