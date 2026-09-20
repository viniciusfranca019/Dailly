// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, inject, onUnmounted, type InjectionKey } from 'vue'
import { mountShell } from './mount.js'
import { testModuleDeps } from '@shared/testing.js'
import type { ModuleDeps, ModuleDescriptor, VueModule } from '@shared'

let host: HTMLElement

/**
 * A module stands in as a component, because that is what a module now is.
 *
 * The dublê changed shape with the contract; the assertions below did not. That
 * is the whole claim of this migration, and this file is where it is visible.
 */
const fakeModule = (marker: string) => {
  const destroy = vi.fn()
  const seen: ModuleDeps[] = []
  const component = defineComponent({
    props: { deps: { type: Object, required: true } },
    setup(props) {
      seen.push(props.deps as ModuleDeps)
      onUnmounted(destroy)
      return () => h('p', { 'data-marker': marker })
    },
  })
  return { module: { component } satisfies VueModule, destroy, seen }
}

const descriptorFor = (id: string, route: string, module: VueModule) => {
  const load = vi.fn(() => Promise.resolve(module))
  const descriptor: ModuleDescriptor<VueModule> = { id, title: id, route, load }
  return { descriptor, load }
}

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>'
  host = document.querySelector<HTMLElement>('#app')!
})

describe('mountShell', () => {
  it('mounts the first module of the manifest on boot', async () => {
    const first = fakeModule('daily-log')
    const { descriptor } = descriptorFor('daily-log', '/', first.module)

    const shell = await mountShell(host, { modules: [descriptor], deps: testModuleDeps() })

    expect(shell.current).toBe('/')
    expect(host.querySelector('[data-marker="daily-log"]')).not.toBeNull()
  })

  it('loads a module only when it is visited', async () => {
    // This is the whole point of the lazy `load`: a module that is in the
    // manifest but never opened costs nothing at boot, and one that is flagged
    // out of the manifest is never referenced at all.
    const a = descriptorFor('daily-log', '/', fakeModule('daily-log').module)
    const b = descriptorFor('analyse', '/analyse', fakeModule('analyse').module)

    const shell = await mountShell(host, { modules: [a.descriptor, b.descriptor], deps: testModuleDeps() })

    expect(a.load).toHaveBeenCalledTimes(1)
    expect(b.load).not.toHaveBeenCalled()

    await shell.go('/analyse')
    expect(b.load).toHaveBeenCalledTimes(1)
  })

  it('destroys the outgoing module before mounting the next', async () => {
    const first = fakeModule('daily-log')
    const second = fakeModule('analyse')
    const a = descriptorFor('daily-log', '/', first.module)
    const b = descriptorFor('analyse', '/analyse', second.module)

    const shell = await mountShell(host, { modules: [a.descriptor, b.descriptor], deps: testModuleDeps() })
    await shell.go('/analyse')

    expect(first.destroy).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[data-marker="daily-log"]')).toBeNull()
    expect(host.querySelector('[data-marker="analyse"]')).not.toBeNull()
  })

  it('ignores a route no module claims, instead of blanking the screen', async () => {
    const a = descriptorFor('daily-log', '/', fakeModule('daily-log').module)
    const shell = await mountShell(host, { modules: [a.descriptor], deps: testModuleDeps() })

    await shell.go('/analyse')

    expect(shell.current).toBe('/')
    expect(host.querySelector('[data-marker="daily-log"]')).not.toBeNull()
  })

  it('renders one nav button per enabled module', async () => {
    const a = descriptorFor('daily-log', '/', fakeModule('daily-log').module)
    const b = descriptorFor('analyse', '/analyse', fakeModule('analyse').module)

    await mountShell(host, { modules: [a.descriptor, b.descriptor], deps: testModuleDeps() })

    const routes = [...host.querySelectorAll('[data-testid="nav"] button')].map(
      (button) => (button as HTMLElement).dataset['route'],
    )
    expect(routes).toEqual(['/', '/analyse'])
  })
})

describe('C1: what the shell root provides reaches inside a module', () => {
  /**
   * The reason the contract changed at all.
   *
   * Under the old contract every module was its own `createApp`, so a plugin
   * installed at the root — a component library, Pinia — reached nothing. Both
   * are open pendencies of ADR 0010, and neither can be resolved while this
   * test cannot pass.
   */
  it('delivers a value provided at the root to the mounted module', async () => {
    const probe: InjectionKey<string> = Symbol.for('probe')
    const seen: (string | undefined)[] = []
    const component = defineComponent({
      setup() {
        seen.push(inject(probe))
        return () => h('p', { 'data-marker': 'probe' })
      },
    })
    const { descriptor } = descriptorFor('daily-log', '/', { component })

    await mountShell(host, {
      modules: [descriptor],
      deps: testModuleDeps(),
      configure: (app) => app.provide(probe, 'from-the-root'),
    })

    expect(seen).toEqual(['from-the-root'])
  })

  it('runs every module of a session inside one application', async () => {
    // Not two apps that happen to agree: the second module must see the same
    // provide without the shell passing it along by hand.
    const probe: InjectionKey<string> = Symbol.for('probe')
    const seen: (string | undefined)[] = []
    const probing = (marker: string) =>
      defineComponent({
        setup() {
          seen.push(inject(probe))
          return () => h('p', { 'data-marker': marker })
        },
      })
    const a = descriptorFor('daily-log', '/', { component: probing('daily-log') })
    const b = descriptorFor('analyse', '/analyse', { component: probing('analyse') })

    const shell = await mountShell(host, {
      modules: [a.descriptor, b.descriptor],
      deps: testModuleDeps(),
      configure: (app) => app.provide(probe, 'from-the-root'),
    })
    await shell.go('/analyse')

    expect(seen).toEqual(['from-the-root', 'from-the-root'])
  })
})

describe('C2: a module declares a component, not a mount function', () => {
  it('hands the module its deps as a prop, without the module wiring anything', async () => {
    const first = fakeModule('daily-log')
    const { descriptor } = descriptorFor('daily-log', '/', first.module)
    const deps = testModuleDeps({ zone: 'America/Sao_Paulo' })

    await mountShell(host, { modules: [descriptor], deps })

    expect(first.seen).toHaveLength(1)
    expect(first.seen[0]).toBe(deps)
  })

  it('tears the module down on destroy and leaves the host empty', async () => {
    const first = fakeModule('daily-log')
    const { descriptor } = descriptorFor('daily-log', '/', first.module)

    const shell = await mountShell(host, { modules: [descriptor], deps: testModuleDeps() })
    shell.destroy()

    expect(first.destroy).toHaveBeenCalledTimes(1)
    expect(host.children.length).toBe(0)
  })
})

describe('C4: the current route is reported only once the screen has changed', () => {
  /**
   * The one behavioural difference the contract change introduces.
   *
   * `module.mount(outlet)` wrote to the DOM synchronously; `<component :is>`
   * renders on the next tick. Without an awaited tick inside `go`, a caller
   * that awaits navigation observes a window where the route already moved and
   * the screen has not — and every assertion below would need a sleep to pass.
   */
  it('has the new module on screen by the time go() resolves', async () => {
    const a = descriptorFor('daily-log', '/', fakeModule('daily-log').module)
    const b = descriptorFor('analyse', '/analyse', fakeModule('analyse').module)

    const shell = await mountShell(host, { modules: [a.descriptor, b.descriptor], deps: testModuleDeps() })
    await shell.go('/analyse')

    // No settle, no timer: if this needs one, `go` is lying about being done.
    expect(shell.current).toBe('/analyse')
    expect(host.querySelector('[data-marker="analyse"]')).not.toBeNull()
  })

  it('has the first module on screen by the time mountShell() resolves', async () => {
    const a = descriptorFor('daily-log', '/', fakeModule('daily-log').module)

    await mountShell(host, { modules: [a.descriptor], deps: testModuleDeps() })

    expect(host.querySelector('[data-marker="daily-log"]')).not.toBeNull()
  })

  it('marks the active route on the navigation', async () => {
    const a = descriptorFor('daily-log', '/', fakeModule('daily-log').module)
    const b = descriptorFor('analyse', '/analyse', fakeModule('analyse').module)

    const shell = await mountShell(host, { modules: [a.descriptor, b.descriptor], deps: testModuleDeps() })
    await shell.go('/analyse')

    const active = host.querySelector('[data-testid="nav"] [aria-current="page"]')
    expect((active as HTMLElement | null)?.dataset['route']).toBe('/analyse')
  })
})
