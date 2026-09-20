import {
  assertManifest,
  findByRoute,
  type ModuleDeps,
  type ModuleDescriptor,
  type VueModule,
} from '@shared'
import { createApp, h, nextTick, ref, shallowRef, type App, type Component } from 'vue'
import Shell from './Shell.vue'

export interface ShellOptions {
  readonly modules: readonly ModuleDescriptor<VueModule>[]
  /**
   * Built by the composition root and passed straight through. The shell does
   * not read them — it is a router, not a consumer — which is why a test can
   * hand it fakes without the shell learning anything about the domain.
   */
  readonly deps: ModuleDeps
  /**
   * The seam for everything that belongs to the application rather than to a
   * screen: `app.use(pinia)`, `app.use(someComponentLibrary)`, `app.provide`.
   *
   * It exists because there is exactly **one** application. That is the reason
   * the module contract stopped being `mount(host)` — with a `createApp` per
   * module, a plugin installed here would have reached nothing, and both of
   * ADR 0010's open pendencies are plugins.
   */
  configure?(app: App): void
}

export interface ShellHandle {
  /** Route currently mounted. */
  readonly current: string
  go(route: string): Promise<void>
  destroy(): void
}

/**
 * Mounts one module at a time into the shell's outlet, loading it on first visit.
 *
 * Nothing here knows any module by name: the shell reads the manifest it is
 * given, which is what makes a module removable by a flag without editing the
 * shell.
 */
export async function mountShell(host: HTMLElement, options: ShellOptions): Promise<ShellHandle> {
  const { modules, deps, configure } = options
  assertManifest(modules)

  const current = ref('')
  /**
   * `shallowRef`, because a component definition is a large object that is
   * always replaced whole. Making it deeply reactive would walk the render
   * function and every option for no benefit at all.
   */
  const component = shallowRef<Component | null>(null)
  /** Loaded once per route: revisiting a module must not re-run its `load`. */
  const loaded = new Map<string, Component>()

  /**
   * Which navigation currently owns the screen.
   *
   * Two clicks race across the `await` below, and without this the *earlier*
   * one wins whenever its chunk is slower — a double-click on the navigation
   * lands on the first destination. Bumping it in `destroy` covers the same
   * hazard at the end of life: a navigation still in flight must not render
   * into a host the shell has already given back.
   */
  let navigation = 0

  async function go(route: string): Promise<void> {
    const descriptor = findByRoute(modules, route)
    if (!descriptor || route === current.value) return

    const ticket = ++navigation

    let next = loaded.get(route)
    if (!next) {
      next = (await descriptor.load()).component
      loaded.set(route, next)
    }

    // Someone asked for somewhere else while this was loading. They win: the
    // last thing the user asked for is the thing they are waiting to see.
    if (ticket !== navigation) return

    component.value = next
    current.value = route

    /**
     * The one behavioural difference the Vue contract introduces, paid here
     * rather than by every caller.
     *
     * `module.mount(outlet)` wrote to the DOM synchronously; `<component :is>`
     * renders on the next tick. Without this await, `go` would resolve while
     * the outgoing module is still on screen — a window in which the route has
     * moved and the screen has not.
     */
    await nextTick()
  }

  /**
   * A render function rather than props on `createApp`, so the frame re-renders
   * when the routing state changes. Passing the refs themselves would hand the
   * component ref objects instead of values; reading `.value` inside `render`
   * is what registers the dependency.
   */
  const app = createApp({
    render: () =>
      h(Shell, {
        modules,
        deps,
        current: current.value,
        component: component.value,
        onNavigate: (route: string) => void go(route),
      }),
  })

  configure?.(app)
  app.mount(host)

  await go(modules[0]!.route)

  return {
    get current() {
      return current.value
    },
    go,
    destroy() {
      navigation++
      app.unmount()
      current.value = ''
      component.value = null
      loaded.clear()
      host.replaceChildren()
    },
  }
}
