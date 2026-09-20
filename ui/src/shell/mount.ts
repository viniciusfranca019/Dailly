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
  /**
   * The module the user asked for last, which is **not** the same thing as the
   * one on screen.
   *
   * `current` only moves once a module has loaded, so while a slow chunk is in
   * flight the two disagree — and that gap is the whole race. Guarding against
   * `current` meant that asking to come back to where you already are looked
   * like a no-op and was dropped, leaving the navigation in flight to win.
   * Guarding against `requested` asks the right question: is this where we are
   * already heading?
   */
  const requested = ref('')

  /**
   * Loaded once per route.
   *
   * The *promise* is cached rather than the component, so two clicks on the
   * same not-yet-loaded button share one `load()` instead of racing to fill the
   * map after their awaits. A rejected entry is evicted, which is what lets a
   * failed module be retried by clicking it again.
   */
  const loaded = new Map<string, Promise<Component>>()

  /** The module that failed to load, so the outlet can say so. */
  const failed = shallowRef<{ route: string; title: string } | null>(null)

  /**
   * Which navigation currently owns the screen.
   *
   * Two clicks race across the `await` below, and without this the *earlier*
   * one wins whenever its chunk is slower.
   *
   * It says nothing about teardown: `destroyed` covers that, and covers it
   * better, because it also stops a navigation *started* after `destroy()`
   * rather than only abandoning one already in flight. Bumping this counter in
   * `destroy` as well would be a second mechanism guarding the same thing, and
   * the one that guards less.
   */
  let navigation = 0
  let destroyed = false

  async function go(route: string): Promise<void> {
    if (destroyed) return
    const descriptor = findByRoute(modules, route)
    if (!descriptor || route === requested.value) return

    requested.value = route
    const ticket = ++navigation

    let next = loaded.get(route)
    if (!next) {
      next = descriptor.load().then((module) => module.component)
      loaded.set(route, next)
    }

    let resolved: Component
    try {
      resolved = await next
    } catch {
      // Evicted so the same click can be tried again; a cached rejection would
      // make the failure permanent for the life of the window.
      loaded.delete(route)
      // Someone has moved on. Their navigation owns the screen, not this error.
      if (ticket !== navigation || destroyed) return

      /**
       * A module load is a remote read, and a remote read needs all four of its
       * states. Throwing here would only produce an unhandled rejection from
       * the click handler: the user would click, nothing would happen, and
       * nothing on screen would say why.
       */
      failed.value = { route, title: descriptor.title }
      component.value = null
      current.value = route
      // Released so the same route can be asked for again: the message on
      // screen tells the user to click again, and the guard above would
      // otherwise swallow that click.
      requested.value = ''
      await nextTick()
      return
    }

    // Someone asked for somewhere else while this was loading. They win: the
    // last thing the user asked for is the thing they are waiting to see.
    if (ticket !== navigation || destroyed) return

    failed.value = null
    component.value = resolved
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
        failed: failed.value,
        // `go` handles its own failures and never rejects, which is what makes
        // discarding the promise here safe rather than merely quiet.
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
      destroyed = true
      app.unmount()
      current.value = ''
      requested.value = ''
      component.value = null
      failed.value = null
      loaded.clear()
      host.replaceChildren()
    },
  }
}
