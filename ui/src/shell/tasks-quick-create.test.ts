// @vitest-environment jsdom
import { type TaskStore } from '@dailly/tasks-core'
import { inMemoryTaskStore } from '@dailly/tasks-core/testing'
import type { ModuleDescriptor, TasksPort, VueModule } from '@shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountShell, type ShellHandle } from './mount.js'
import { testShellDeps } from './testing.js'

/**
 * Card #48 (F10) across the shell, with the real Tasks module: C1 on the Daily
 * Log, C3 with the Tasks on the screen, C6's focus back.
 */
let host: HTMLElement
let shell: ShellHandle | undefined
beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>'
  host = document.querySelector<HTMLElement>('#app')!
  localStorage.clear()
})
afterEach(() => shell?.destroy())

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
/** The first `import()` of the Tasks module takes longer than a few ticks. */
async function until<T>(find: () => T | null, timeout = 3000): Promise<T> {
  const start = performance.now()
  for (;;) {
    const found = find()
    if (found) return found
    if (performance.now() - start > timeout) throw new Error('timed out waiting for the screen')
    await wait(20)
  }
}
const settle = async () => {
  await wait(50)
  for (let n = 0; n < 6; n += 1) await wait(0)
}

async function start(): Promise<{ store: TaskStore; casa: string }> {
  let n = 0
  const store = inMemoryTaskStore({ newId: () => `id-${(n += 1)}`, now: () => '2026-11-09T12:00:00.000Z' })
  const casa = (await store.createBoard({ name: 'Casa', prefix: 'CASA' })).id
  const todo = (await store.board(casa))!.statuses.find((status) => status.name === 'A fazer')!.id
  await store.create({ boardId: casa, title: 'Lixar a parede', statusId: todo })
  localStorage.setItem('dailly.tasks.board', casa)
  const base = testShellDeps()
  const port = base.own.tasks.tasks as TasksPort
  const tasks = Object.fromEntries(
    Object.keys(port).map((name) => [name, (...args: unknown[]) => (store as unknown as Record<string, (...a: unknown[]) => unknown>)[name]!(...args)]),
  ) as unknown as TasksPort
  const deps = { ...base, own: { ...base.own, tasks: { labels: base.own.tasks.labels, tasks: { ...tasks, deleteComment: async () => true } } } }
  const modules: ModuleDescriptor<VueModule>[] = [
    {
      id: 'daily-log',
      title: 'Daily Log',
      route: '/',
      load: async () => ({
        component: defineComponent({ setup: () => () => h('div', [h('button', { type: 'button' }, 'Registrar')]) }),
      }),
    },
    {
      id: 'tasks',
      title: 'Tasks',
      route: '/tasks',
      commands: [{ id: 'create', shortcut: { key: 'c' } }],
      load: () => import('@modules/tasks'),
    },
  ]
  shell = await mountShell(host, { modules, deps })
  return { store, casa }
}

const form = () => host.querySelector<HTMLElement>('[role="dialog"][aria-label="Nova tarefa em Casa"]')
async function createWith(text: string): Promise<void> {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', cancelable: true }))
  const title = await until(() => (form() ? form()!.querySelector<HTMLInputElement>('input[aria-label="Título"]') : null))
  title.value = text
  title.dispatchEvent(new Event('input'))
  form()!.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
  await settle()
}

describe('C1, C3: no Daily Log, C cria no board "Casa" e deixa o aviso', () => {
  it('o formulário fecha, a tarefa entra em "Casa", e a tela mostra "CASA-2 criada"', async () => {
    const { store, casa } = await start()

    await createWith('Comprar tinta')

    expect(form()).toBeNull()
    expect(shell!.current).toBe('/')
    expect(host.querySelector('[role="status"]')?.textContent).toBe('CASA-2 criada')
    expect((await store.board(casa))!.tasks[0]).toMatchObject({ key: 2, title: 'Comprar tinta' })
  })
})

describe('C3: com o Tasks na tela, no board "Casa", o board relê', () => {
  it('CASA-2 "Comprar tinta" aparece no topo de "A fazer", sem aviso', async () => {
    await start()
    await shell!.go('/tasks')
    await until(() => ((host.textContent ?? '').includes('Lixar a parede') ? true : null))

    await createWith('Comprar tinta')

    const cards = await until(() => {
      const text = host.textContent ?? ''
      return text.includes('Comprar tinta') ? text : null
    })
    expect(cards.indexOf('Comprar tinta')).toBeLessThan(cards.indexOf('Lixar a parede'))
    expect(host.querySelector('[role="status"]')).toBeNull()
  })
})

describe('C6: Esc fecha sem criar, e o foco volta onde estava', () => {
  it('o foco volta ao botão do Daily Log', async () => {
    const { store, casa } = await start()
    const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find((node) => node.textContent === 'Registrar')!
    button.focus()

    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true }))
    const title = await until(() => (form() ? form()!.querySelector<HTMLInputElement>('input[aria-label="Título"]') : null))
    title.value = 'Comprar tinta'
    title.dispatchEvent(new Event('input'))
    title.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await settle()

    expect(form()).toBeNull()
    expect(document.activeElement).toBe(button)
    expect((await store.board(casa))!.tasks).toHaveLength(1)
  })
})
