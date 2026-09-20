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

describe('overlapping navigation', () => {
  /**
   * Found by the author, not by the gate, and not one of the agreed scenarios.
   *
   * It is a defect the vanilla `go` had in exactly the same shape — two clicks
   * race and the *earlier* one wins if its module loads slower. It is fixed
   * here rather than carried forward because this diff rewrote the function
   * that holds it, and "the reviewer did not catch it" is not a reason to ship
   * a race you have already proven.
   */
  const slowModule = (marker: string, delay: number) => {
    const module: VueModule = {
      component: defineComponent({ setup: () => () => h('p', { 'data-marker': marker }) }),
    }
    return vi.fn(() => new Promise<VueModule>((resolve) => setTimeout(() => resolve(module), delay)))
  }

  it('lands on the route asked for last, not the one that loaded first', async () => {
    const a = descriptorFor('daily-log', '/', fakeModule('daily-log').module)
    const slow: ModuleDescriptor<VueModule> = {
      id: 'analyse',
      title: 'analyse',
      route: '/analyse',
      load: slowModule('analyse', 50),
    }
    const quick: ModuleDescriptor<VueModule> = {
      id: 'third',
      title: 'third',
      route: '/third',
      load: slowModule('third', 1),
    }

    const shell = await mountShell(host, {
      modules: [a.descriptor, slow, quick],
      deps: testModuleDeps(),
    })

    // Two clicks in a row, the slow destination first — a double-click on the
    // navigation, or a click while a chunk is still in flight.
    await Promise.all([shell.go('/analyse'), shell.go('/third')])

    expect(shell.current).toBe('/third')
    expect(host.querySelector('[data-marker="third"]')).not.toBeNull()
    expect(host.querySelector('[data-marker="analyse"]')).toBeNull()
  })

  it('abandons a navigation that was still loading when the shell was destroyed', async () => {
    const a = descriptorFor('daily-log', '/', fakeModule('daily-log').module)
    const slow: ModuleDescriptor<VueModule> = {
      id: 'analyse',
      title: 'analyse',
      route: '/analyse',
      load: slowModule('analyse', 20),
    }

    const shell = await mountShell(host, { modules: [a.descriptor, slow], deps: testModuleDeps() })
    const pending = shell.go('/analyse')
    shell.destroy()
    await pending

    // Nothing may be rendered into a host the shell has already given back.
    expect(host.children.length).toBe(0)
    expect(shell.current).toBe('')
  })
})

describe('gate iteration 1 — navigation that was asked for last', () => {
  const slowModule = (marker: string, delay: number) => {
    const module: VueModule = {
      component: defineComponent({ setup: () => () => h('p', { 'data-marker': marker }) }),
    }
    return vi.fn(() => new Promise<VueModule>((resolve) => setTimeout(() => resolve(module), delay)))
  }

  /**
   * MAJOR 1 — the half of the race the first fix did not close.
   *
   * `current` means "what is on screen"; the guard needed "what was asked for
   * last". Asking to come back to where you already are took the early return,
   * which never bumped the ticket, so the navigation still in flight kept its
   * claim and won.
   */
  it('stays put when the user clicks back to the route already on screen', async () => {
    const a = descriptorFor('daily-log', '/', fakeModule('daily-log').module)
    const slow: ModuleDescriptor<VueModule> = {
      id: 'analyse',
      title: 'analyse',
      route: '/analyse',
      load: slowModule('analyse', 50),
    }

    const shell = await mountShell(host, { modules: [a.descriptor, slow], deps: testModuleDeps() })

    // Click Analyse, then click Daily Log again before the chunk lands.
    const leaving = shell.go('/analyse')
    await shell.go('/')
    await leaving

    expect(shell.current).toBe('/')
    expect(host.querySelector('[data-marker="daily-log"]')).not.toBeNull()
    expect(host.querySelector('[data-marker="analyse"]')).toBeNull()
  })

  it('calls load once when the same button is clicked twice before it lands', async () => {
    // The docblock promised "loaded once per route" while the map was written
    // only after the await, so the second click missed it.
    const a = descriptorFor('daily-log', '/', fakeModule('daily-log').module)
    const load = slowModule('analyse', 20)
    const slow: ModuleDescriptor<VueModule> = { id: 'analyse', title: 'analyse', route: '/analyse', load }

    const shell = await mountShell(host, { modules: [a.descriptor, slow], deps: testModuleDeps() })
    await Promise.all([shell.go('/analyse'), shell.go('/analyse')])

    expect(load).toHaveBeenCalledTimes(1)
  })

  it('is inert after destroy, instead of writing to a host it gave back', async () => {
    const a = descriptorFor('daily-log', '/', fakeModule('daily-log').module)
    const b = descriptorFor('analyse', '/analyse', fakeModule('analyse').module)

    const shell = await mountShell(host, { modules: [a.descriptor, b.descriptor], deps: testModuleDeps() })
    shell.destroy()
    await shell.go('/analyse')

    expect(shell.current).toBe('')
    expect(host.children.length).toBe(0)
  })
})

describe('gate iteration 1 — a module that fails to load', () => {
  /**
   * MAJOR 2 — the click that produced nothing at all.
   *
   * `void go(route)` threw the promise away, so a rejected `load()` became an
   * unhandled rejection and the screen simply did not change. A module load is
   * a remote read, and a remote read that renders no error state is three of
   * the four states, which is a bug rather than a polish item.
   */
  const broken = (route: string): ModuleDescriptor<VueModule> => ({
    id: 'analyse',
    title: 'Analyse',
    route,
    load: vi.fn(() => Promise.reject(new Error('chunk 404'))),
  })

  it('says on screen that the module could not be loaded', async () => {
    const a = descriptorFor('daily-log', '/', fakeModule('daily-log').module)
    const shell = await mountShell(host, {
      modules: [a.descriptor, broken('/analyse')],
      deps: testModuleDeps(),
    })

    await shell.go('/analyse')

    const alert = host.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    // Naming the module is the difference between a diagnosis and a shrug.
    expect(alert?.textContent).toContain('Analyse')
  })

  it('does not reject, so a click handler cannot leave an unhandled rejection', async () => {
    const a = descriptorFor('daily-log', '/', fakeModule('daily-log').module)
    const shell = await mountShell(host, {
      modules: [a.descriptor, broken('/analyse')],
      deps: testModuleDeps(),
    })

    await expect(shell.go('/analyse')).resolves.toBeUndefined()
  })

  it('lets the same route be tried again, which is what the message promises', async () => {
    const a = descriptorFor('daily-log', '/', fakeModule('daily-log').module)
    const good = fakeModule('analyse').module
    let attempts = 0
    const flaky: ModuleDescriptor<VueModule> = {
      id: 'analyse',
      title: 'Analyse',
      route: '/analyse',
      load: vi.fn(() =>
        ++attempts === 1 ? Promise.reject(new Error('chunk 404')) : Promise.resolve(good),
      ),
    }

    const shell = await mountShell(host, { modules: [a.descriptor, flaky], deps: testModuleDeps() })

    await shell.go('/analyse')
    expect(host.querySelector('[role="alert"]')).not.toBeNull()

    await shell.go('/analyse')

    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(host.querySelector('[data-marker="analyse"]')).not.toBeNull()
    expect(shell.current).toBe('/analyse')
  })

  it('recovers when the user navigates somewhere that works', async () => {
    const a = descriptorFor('daily-log', '/', fakeModule('daily-log').module)
    const shell = await mountShell(host, {
      modules: [a.descriptor, broken('/analyse')],
      deps: testModuleDeps(),
    })

    await shell.go('/analyse')
    await shell.go('/')

    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(host.querySelector('[data-marker="daily-log"]')).not.toBeNull()
  })
})
