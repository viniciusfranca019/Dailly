import {
  assertManifest,
  findByRoute,
  type ModuleDeps,
  type ModuleDescriptor,
  type ModuleHandle,
  type MountableModule,
} from '@shared'

export interface ShellOptions {
  readonly modules: readonly ModuleDescriptor<MountableModule>[]
  /**
   * Built by the composition root and passed straight through. The shell does
   * not read them — it is a router, not a consumer — which is why a test can
   * hand it fakes without the shell learning anything about the domain.
   */
  readonly deps: ModuleDeps
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
  const { modules, deps } = options
  assertManifest(modules)

  const frame = document.createElement('div')
  frame.className = 'flex h-full min-h-0'

  const sidebar = document.createElement('aside')
  sidebar.className =
    'flex w-60 shrink-0 flex-col border-r border-[#1e2638] bg-[#0a0d16] px-3 py-4'
  sidebar.dataset['testid'] = 'sidebar'

  const workspace = document.createElement('header')
  workspace.className =
    'mb-5 flex items-center gap-2 px-2 text-sm font-semibold tracking-tight text-gray-100'
  workspace.innerHTML =
    '<span class="grid h-5 w-5 place-items-center rounded bg-blue-600 text-[10px] font-bold text-white">D</span>' +
    '<span>Diário &amp; Logs</span>'

  const nav = document.createElement('nav')
  nav.className = 'flex flex-col gap-0.5'
  nav.dataset['testid'] = 'nav'

  /**
   * The sidebar lists the manifest, and only the manifest.
   *
   * The design it is modelled on shows Inbox, Histórico and Tags as well. Those
   * are not modules of this product — inventing links that lead nowhere would
   * make a screenshot that lies about what the app does, and the flag mechanism
   * exists precisely so what ships is what is built.
   */
  const buttons = new Map<string, HTMLButtonElement>()
  for (const module of modules) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = module.title
    button.dataset['route'] = module.route
    button.className =
      'rounded-md px-2 py-1.5 text-left text-sm font-medium text-[#747e8f] transition-colors hover:bg-white/5 hover:text-gray-200'
    button.addEventListener('click', () => void go(module.route))
    buttons.set(module.route, button)
    nav.append(button)
  }

  /**
   * ADR 0007 asks for the zone to be visible *always*, not tucked into
   * Settings, because every date on every screen is derived from it. The
   * sidebar footer is the one place on this layout that is always on screen.
   */
  const footer = document.createElement('footer')
  footer.className = 'mt-auto border-t border-[#1e2638] px-2 pt-3 text-xs text-[#747e8f]'
  footer.dataset['testid'] = 'zone'
  footer.textContent = `fuso: ${deps.zone}`

  sidebar.append(workspace, nav, footer)

  const outlet = document.createElement('main')
  outlet.className = 'min-w-0 flex-1 overflow-y-auto bg-[#0c101b]'
  outlet.dataset['testid'] = 'outlet'

  frame.append(sidebar, outlet)
  host.replaceChildren(frame)

  let mounted: ModuleHandle | undefined
  let current = ''

  async function go(route: string): Promise<void> {
    const descriptor = findByRoute(modules, route)
    if (!descriptor || route === current) return

    mounted?.destroy()
    outlet.replaceChildren()

    const module = await descriptor.load()
    mounted = module.mount(outlet, deps)
    current = route

    for (const [candidate, button] of buttons) {
      const active = candidate === route
      button.classList.toggle('bg-white/5', active)
      button.classList.toggle('text-gray-100', active)
      button.classList.toggle('text-[#747e8f]', !active)
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
