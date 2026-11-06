import {
  assertManifest,
  blockedByFocus,
  findByRoute,
  matchesShortcut,
  type ModuleDescriptor,
  type VueModule,
} from '@shared'
import { createApp, h, nextTick, ref, shallowRef, type App, type Component } from 'vue'
import { arrange, readOrder, writeOrder } from './nav-order.js'
import { depsFor, type ShellDeps } from './own-deps.js'
import Shell from './Shell.vue'

export interface ShellOptions {
  readonly modules: readonly ModuleDescriptor<VueModule>[]
  /**
   * Built by the composition root and passed straight through. The shell does
   * not read them — it is a router, not a consumer — which is why a test can
   * hand it fakes without the shell learning anything about the domain.
   *
   * Two halves: what every module gets, and what each one gets alone. The
   * shell only joins them per module, so a module never sees a neighbour's.
   */
  readonly deps: ShellDeps
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
  /**
   * Where the sidebar order the person chose is kept. Injectable so a test does
   * not share the browser's `localStorage` with the next one; a storage that is
   * missing or throws only means the order lasts until the reload.
   */
  storage?: () => Storage | undefined
}

export interface ShellHandle {
  /** Route currently mounted. */
  readonly current: string
  /**
   * Navigate, resolving once the new module is on screen — **except** when the
   * route asked for is already the one being navigated to, in which case the
   * call is a no-op and resolves straight away while the earlier navigation is
   * still in flight.
   *
   * Said out loud because "resolved" and "arrived" are the same thing on every
   * other path, and a caller that awaits a duplicate click would otherwise be
   * entitled to assume it here too.
   */
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
  const storage = options.storage ?? (() => globalThis.localStorage)
  assertManifest(modules)

  /**
   * The sidebar's order, as ids. Display only: boot still opens the manifest's
   * first module, and `go` still resolves routes against the manifest.
   */
  const order = ref(arrange(modules, readOrder(storage)).map((module) => module.id))
  function reorder(next: string[]): void {
    order.value = next
    writeOrder(storage, next)
  }
  const moduleDeps = depsFor(deps)

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
   *
   * A plain `let`, not a `ref`: nothing renders from it. It sits beside
   * `navigation` and `destroyed`, which are the other two variables the render
   * function never reads, and wearing the same shape as them says so.
   */
  let requested = ''

  /**
   * Loaded once per route.
   *
   * The *promise* is cached rather than the component, so two clicks on the
   * same not-yet-loaded button share one `load()` instead of racing to fill the
   * map after their awaits. A rejected entry is evicted, which is what lets a
   * failed module be retried by clicking it again.
   */
  const loaded = new Map<string, Promise<VueModule>>()

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
  /** The module behind a route, loaded once; a failed load is forgotten, so the next try loads again. */
  function loadModule(descriptor: ModuleDescriptor<VueModule>): Promise<VueModule> {
    let next = loaded.get(descriptor.route)
    if (!next) {
      next = descriptor.load()
      loaded.set(descriptor.route, next)
      // Evicted so the same click can be tried again; a cached rejection would
      // make the failure permanent for the life of the window.
      next.catch(() => loaded.delete(descriptor.route))
    }
    return next
  }

  let navigation = 0
  let destroyed = false

  async function go(route: string): Promise<void> {
    if (destroyed) return
    const descriptor = findByRoute(modules, route)
    if (!descriptor || route === requested) return

    requested = route
    const ticket = ++navigation

    let resolved: Component
    try {
      /**
       * Inside the `try`, not before it.
       *
       * `descriptor.load()` is called here, and a `load` that throws
       * *synchronously* instead of returning a rejected promise would escape
       * this function entirely — rejecting `mountShell` at boot, or leaving an
       * unhandled rejection from a click, with `requested` still holding the
       * route so it could never be clicked again. Unreachable with a real
       * `() => import(...)`, which always returns a promise; inside the `try`
       * because "`go` never rejects" should be true of the code and not only
       * of the inputs it happens to get.
       */
      resolved = (await loadModule(descriptor)).component
    } catch {
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
      requested = ''
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
  /**
   * The command open over the screen, if any (cards #47, #48). The focus it
   * took is given back on close (C3 of #47), and pressing its shortcut again
   * only bumps `focusTick`, so the command takes the focus back.
   */
  const command = shallowRef<{ key: string; component: Component; moduleId: string; focusTick: number } | null>(null)
  let returnFocus: HTMLElement | null = null
  let opening = 0

  function closeCommand(): void {
    command.value = null
    const target = returnFocus
    returnFocus = null
    if (target?.isConnected) target.focus()
  }

  async function openCommand(descriptor: ModuleDescriptor<VueModule>, id: string): Promise<void> {
    const key = `${descriptor.id}:${id}`
    if (command.value?.key === key) {
      command.value = { ...command.value, focusTick: command.value.focusTick + 1 }
      return
    }
    const ticket = ++opening
    if (!command.value) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    let module: VueModule
    try {
      module = await loadModule(descriptor)
    } catch {
      // The chunk did not arrive; the next press tries again (and `go` reports it).
      return
    }
    const component = module.commands?.[id]
    if (!component || ticket !== opening || destroyed) return
    command.value = { key, component, moduleId: descriptor.id, focusTick: 0 }
  }

  let layer: HTMLElement | null = null

  /**
   * The layer is modal: a focus that leaves it is taken back, and Esc from
   * anywhere, or a click on the backdrop, closes it (J10.1a).
   */
  function onFocusin(event: FocusEvent): void {
    if (!command.value || !layer || !(event.target instanceof Node) || layer.contains(event.target)) return
    layer.querySelector<HTMLElement>('input, button, select, textarea, [tabindex]')?.focus()
  }
  document.addEventListener('focusin', onFocusin)

  /** One listener for every command; the Ctrl+S of the panel and the composer stay where they are. */
  function onKeydown(event: KeyboardEvent): void {
    if (command.value && event.key === 'Escape') {
      // The command's Esc only: a screen under it (the task panel) must not take it too.
      event.preventDefault()
      event.stopImmediatePropagation()
      closeCommand()
      return
    }
    for (const descriptor of modules) {
      for (const declared of descriptor.commands ?? []) {
        if (!matchesShortcut(event, declared.shortcut) || blockedByFocus(declared.shortcut, event.target)) continue
        // Before the browser takes it (Ctrl+K is its address bar) or a field types it (C2).
        event.preventDefault()
        void openCommand(descriptor, declared.id)
        return
      }
    }
  }
  window.addEventListener('keydown', onKeydown)

  const app = createApp({
    render: () => [
      h(Shell, {
        modules: arrange(modules, order.value),
        zone: deps.shared.zone,
        deps: moduleDeps(findByRoute(modules, current.value)?.id ?? ''),
        current: current.value,
        component: component.value,
        failed: failed.value,
        // `go` handles its own failures and never rejects, which is what makes
        // discarding the promise here safe rather than merely quiet.
        onNavigate: (route: string) => void go(route),
        onReorder: reorder,
      }),
      command.value
        ? h(
            'div',
            {
              class: 'fixed inset-0 z-40 flex items-start justify-center bg-black/40 pt-[12vh]',
              'data-testid': 'command',
              ref: (element: unknown) => {
                layer = element instanceof HTMLElement ? element : null
              },
              onClick: (event: MouseEvent) => {
                if (event.target === event.currentTarget) closeCommand()
              },
            },
            h(command.value.component, {
              deps: moduleDeps(command.value.moduleId),
              focusTick: command.value.focusTick,
              navigate: (route: string) => void go(route),
              close: closeCommand,
            }),
          )
        : null,
    ],
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
      window.removeEventListener('keydown', onKeydown)
      document.removeEventListener('focusin', onFocusin)
      command.value = null
      app.unmount()
      current.value = ''
      requested = ''
      component.value = null
      failed.value = null
      loaded.clear()
      host.replaceChildren()
    },
  }
}
