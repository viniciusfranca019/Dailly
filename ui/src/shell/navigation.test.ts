// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountShell } from './mount.js'
import { testModuleDeps } from '@shared/testing.js'
import type { ModuleDescriptor, VueModule } from '@shared'

let host: HTMLElement
beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>'
  host = document.querySelector<HTMLElement>('#app')!
})

const comp = (m: string) => defineComponent({ setup: () => () => h('p', { 'data-marker': m }) })

const ok = (id: string, route: string, delay: number): ModuleDescriptor<VueModule> => ({
  id, title: id, route,
  load: vi.fn(() => new Promise<VueModule>((r) => setTimeout(() => r({ component: comp(id) }), delay))),
})
const bad = (id: string, route: string, delay: number): ModuleDescriptor<VueModule> => ({
  id, title: id, route,
  load: vi.fn(() => new Promise<VueModule>((_, j) => setTimeout(() => j(new Error('boom')), delay))),
})

/**
 * Navigation as a state machine, under interleaving.
 *
 * `mount.test.ts` covers the contract; this file covers the four variables that
 * coordinate one screen — `requested`, `current`, the navigation ticket and
 * `destroyed`. They are separate because they disagree on purpose: `requested`
 * moves when the user clicks and `current` moves when the module has loaded,
 * and every case below lives inside the window where those two differ.
 *
 * Written against the real clock with staggered delays rather than fake timers:
 * what is being tested is the order in which promises settle, and a fake timer
 * that fires them all at once tests a schedule that cannot happen.
 */
describe('navigation under interleaving', () => {
  it('slow failure then fast success: the success owns the screen, no stale alert', async () => {
    const home = ok('daily-log', '/', 0)
    const f = bad('analyse', '/analyse', 60)
    const g = ok('third', '/third', 1)
    const shell = await mountShell(host, { modules: [home, f, g], deps: testModuleDeps() })

    const failing = shell.go('/analyse')
    await shell.go('/third')
    await failing

    expect(shell.current).toBe('/third')
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(host.querySelector('[data-marker="third"]')).not.toBeNull()
  })

  it('slow success then fast failure: the failure owns the screen', async () => {
    const home = ok('daily-log', '/', 0)
    const slow = ok('analyse', '/analyse', 60)
    const f = bad('third', '/third', 1)
    const shell = await mountShell(host, { modules: [home, slow, f], deps: testModuleDeps() })

    const slowNav = shell.go('/analyse')
    await shell.go('/third')
    await slowNav

    expect(shell.current).toBe('/third')
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(host.querySelector('[data-marker="analyse"]')).toBeNull()
  })

  it('destroy during a failing load leaves nothing behind', async () => {
    const home = ok('daily-log', '/', 0)
    const f = bad('analyse', '/analyse', 20)
    const shell = await mountShell(host, { modules: [home, f], deps: testModuleDeps() })

    const pending = shell.go('/analyse')
    shell.destroy()
    await pending

    expect(host.children.length).toBe(0)
    expect(shell.current).toBe('')
  })

  it('a failed route can be left and come back to', async () => {
    const home = ok('daily-log', '/', 0)
    const f = bad('analyse', '/analyse', 1)
    const shell = await mountShell(host, { modules: [home, f], deps: testModuleDeps() })

    await shell.go('/analyse')
    await shell.go('/')
    await shell.go('/analyse')

    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(shell.current).toBe('/analyse')
  })
})
