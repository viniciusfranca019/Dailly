// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mountShell, type ShellHandle } from './mount.js'
import { ORDER_KEY } from './nav-order.js'
import { memoryStorage, testShellDeps } from './testing.js'
import type { ModuleDescriptor, VueModule } from '@shared'

let host: HTMLElement
beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>'
  host = document.querySelector<HTMLElement>('#app')!
})

const module = (id: string, title: string, route: string): ModuleDescriptor<VueModule> => ({
  id,
  title,
  route,
  load: () =>
    Promise.resolve({ component: defineComponent({ setup: () => () => h('p', { 'data-marker': id }) }) }),
})
const MANIFEST = [
  module('daily-log', 'Daily Log', '/'),
  module('requests', 'Requests', '/requests'),
  module('tasks', 'Tasks', '/tasks'),
]

const titles = () =>
  [...host.querySelectorAll<HTMLButtonElement>('[data-testid="nav"] button')].map((b) => b.textContent?.trim())
const button = (title: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('[data-testid="nav"] button')].find(
    (b) => b.textContent?.trim() === title,
  )!

/** jsdom has no DragEvent; the handlers only read the event's type. */
const fire = (el: Element, type: string) => el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
const drag = async (from: string, onto: string) => {
  fire(button(from), 'dragstart')
  fire(button(onto), 'dragover')
  fire(button(onto), 'drop')
  fire(button(from), 'dragend')
  await nextTick()
}

const open = (storage = memoryStorage()): Promise<ShellHandle> =>
  mountShell(host, { modules: MANIFEST, deps: testShellDeps(), storage: () => storage })

describe('sidebar order', () => {
  it('C1: dragging a module onto another changes the order', async () => {
    await open()
    await drag('Tasks', 'Daily Log')
    expect(titles()).toEqual(['Tasks', 'Daily Log', 'Requests'])
  })

  it('C2: the order survives a reload', async () => {
    const storage = memoryStorage()
    const first = await open(storage)
    await drag('Tasks', 'Daily Log')
    first.destroy()

    await open(storage)
    expect(titles()).toEqual(['Tasks', 'Daily Log', 'Requests'])
  })

  it('C3: Alt+ArrowUp moves the focused module up and keeps the focus on it', async () => {
    await open()
    button('Requests').focus()
    button('Requests').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }))
    await nextTick()
    await nextTick()

    expect(titles()).toEqual(['Requests', 'Daily Log', 'Tasks'])
    expect(document.activeElement).toBe(button('Requests'))
  })

  it('C3: Alt+ArrowDown moves it down', async () => {
    await open()
    button('Daily Log').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }))
    await nextTick()
    expect(titles()).toEqual(['Requests', 'Daily Log', 'Tasks'])
  })

  it('C3: an arrow without Alt does not reorder', async () => {
    await open()
    button('Requests').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    await nextTick()
    expect(titles()).toEqual(['Daily Log', 'Requests', 'Tasks'])
  })

  it('C4: a saved order without a module puts that module last', async () => {
    await open(memoryStorage({ [ORDER_KEY]: '["requests","daily-log","gone"]' }))
    expect(titles()).toEqual(['Requests', 'Daily Log', 'Tasks'])
  })

  it('C5: an unreadable storage shows the manifest order', async () => {
    await mountShell(host, {
      modules: MANIFEST,
      deps: testShellDeps(),
      storage: () => {
        throw new Error('blocked')
      },
    })
    expect(titles()).toEqual(['Daily Log', 'Requests', 'Tasks'])
  })

  it('C6: clicking still navigates after a reorder, and boot still opens the manifest first', async () => {
    const shell = await open(memoryStorage({ [ORDER_KEY]: '["tasks","requests","daily-log"]' }))
    expect(shell.current).toBe('/')

    button('Requests').click()
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
    expect(shell.current).toBe('/requests')
    expect(host.querySelector('[data-marker="requests"]')).not.toBeNull()
  })

  it('a drop with nothing grabbed changes nothing', async () => {
    await open()
    fire(button('Daily Log'), 'drop')
    await nextTick()
    expect(titles()).toEqual(['Daily Log', 'Requests', 'Tasks'])
  })
})
