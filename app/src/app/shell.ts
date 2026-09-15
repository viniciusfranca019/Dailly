import {
  assertManifest,
  findByRoute,
  type ModuleDescriptor,
  type ModuleHandle,
  type MountableModule,
} from '@shared'

export interface ShellOptions {
  readonly modules: readonly ModuleDescriptor<MountableModule>[]
}

export interface ShellHandle {
  /** Route currently mounted. */
  readonly current: string
  go(route: string): Promise<void>
  destroy(): void
}

/**
 * Mounts one module at a time into `host`, loading it on first visit.
 *
 * Nothing here knows any module by name: the shell reads the manifest it is
 * given, which is what makes a module removable by a flag without editing the
 * shell.
 */
export async function mountShell(host: HTMLElement, options: ShellOptions): Promise<ShellHandle> {
  const { modules } = options
  assertManifest(modules)

  const nav = document.createElement('nav')
  nav.className = 'shell-nav'
  const outlet = document.createElement('div')
  outlet.className = 'shell-outlet'
  host.replaceChildren(nav, outlet)

  const buttons = new Map<string, HTMLButtonElement>()
  for (const module of modules) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = module.title
    button.dataset['route'] = module.route
    button.addEventListener('click', () => void go(module.route))
    buttons.set(module.route, button)
    nav.append(button)
  }

  let mounted: ModuleHandle | undefined
  let current = ''

  async function go(route: string): Promise<void> {
    const descriptor = findByRoute(modules, route)
    if (!descriptor || route === current) return

    mounted?.destroy()
    outlet.replaceChildren()

    const module = await descriptor.load()
    mounted = module.mount(outlet)
    current = route

    for (const [candidate, button] of buttons) {
      button.classList.toggle('is-active', candidate === route)
    }
  }

  await go(modules[0]!.route)

  return {
    get current() {
      return current
    },
    go,
    destroy() {
      mounted?.destroy()
      mounted = undefined
      current = ''
      host.replaceChildren()
    },
  }
}
