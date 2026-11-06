// @vitest-environment jsdom
import { SEED_BOARD } from '@dailly/tasks-core'
import { inMemoryTaskStore } from '@dailly/tasks-core/testing'
import type { ModuleDescriptor, TasksPort, VueModule } from '@shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountShell, type ShellHandle } from './mount.js'
import { testShellDeps } from './testing.js'

/**
 * Card #47, C7, across the shell: the search opened on the Daily Log takes the
 * person to the Tasks, on the board of the task, with its panel open.
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
  await wait(200)
  for (let n = 0; n < 6; n += 1) await wait(0)
}

describe('C7: Escolher abre a tarefa no board dela (J10.3)', () => {
  it('vai para o Tasks, no board "Casa", com o painel de CASA-3 aberto', async () => {
    let n = 0
    const store = inMemoryTaskStore({ newId: () => `id-${(n += 1)}`, now: () => '2026-11-06T12:00:00.000Z' })
    const casa = (await store.createBoard({ name: 'Casa', prefix: 'CASA' })).id
    const todo = (await store.board(casa))!.statuses.find((status) => status.name === 'A fazer')!.id
    for (const title of ['um', 'dois', 'Trocar a lâmpada']) await store.create({ boardId: casa, title, statusId: todo })
    await store.create({ boardId: SEED_BOARD.id, title: 'Pagar o condomínio', statusId: 'todo' })
    // Tasks was left on the board "Tasks".
    localStorage.setItem('dailly.tasks.board', SEED_BOARD.id)
    const base = testShellDeps()
    const port = base.own.tasks.tasks as TasksPort
    const tasks: TasksPort = Object.fromEntries(
      Object.keys(port).map((name) => [name, (...args: unknown[]) => (store as unknown as Record<string, (...a: unknown[]) => unknown>)[name]!(...args)]),
    ) as unknown as TasksPort
    const deps = { ...base, own: { ...base.own, tasks: { tasks: { ...tasks, deleteComment: async () => true } } } }
    const modules: ModuleDescriptor<VueModule>[] = [
      {
        id: 'daily-log',
        title: 'Daily Log',
        route: '/',
        load: async () => ({ component: defineComponent({ setup: () => () => h('p', { 'data-marker': 'daily-log' }) }) }),
      },
      {
        id: 'tasks',
        title: 'Tasks',
        route: '/tasks',
        commands: [{ id: 'search', shortcut: { key: 'k', mod: true } }],
        load: () => import('@modules/tasks'),
      },
    ]
    shell = await mountShell(host, { modules, deps })

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true }))
    await settle()
    const input = await until(() => host.querySelector<HTMLInputElement>('input[aria-label="Buscar tarefa"]'))
    input.value = 'casa-3'
    input.dispatchEvent(new Event('input'))
    await settle()
    host.querySelector<HTMLElement>('[role="option"]')!.click()
    await until(() => host.querySelector('[role="dialog"][aria-label="CASA-3"]'))

    expect(shell.current).toBe('/tasks')
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="Board"]')?.selectedOptions[0]?.textContent?.trim()).toBe('Casa')
    expect(host.querySelector('[role="dialog"][aria-label="CASA-3"]')).not.toBeNull()
    expect(host.querySelector('input[aria-label="Buscar tarefa"]')).toBeNull()

    // gate #47, round 2: the Esc that closes the search is not the panel's too.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true }))
    await until(() => host.querySelector('input[aria-label="Buscar tarefa"]'))
    ;(document.activeElement as HTMLElement | null)?.blur()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    await settle()
    expect(host.querySelector('input[aria-label="Buscar tarefa"]')).toBeNull()
    expect(host.querySelector('[role="dialog"][aria-label="CASA-3"]')).not.toBeNull()
  })
})
