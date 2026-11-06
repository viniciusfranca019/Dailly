// @vitest-environment jsdom
import type { CommandProps, ModuleDescriptor, VueModule } from '@shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, onMounted, ref, watch } from 'vue'
import { mountShell, type ShellHandle } from './mount.js'
import { testShellDeps } from './testing.js'

/**
 * The shell's seam for module commands (card #47, C1 to C3): a module declares
 * a command in its manifest entry and a component in its index, and the shell
 * opens it from the shortcut on any screen. The module here is a stand-in; the
 * search itself is pinned in the Tasks module.
 */
let host: HTMLElement
let shell: ShellHandle | undefined
beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>'
  host = document.querySelector<HTMLElement>('#app')!
})
afterEach(() => shell?.destroy())

const settle = async () => {
  for (let n = 0; n < 4; n += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

const Home = defineComponent({
  setup: () => () => h('div', [h('textarea', { 'aria-label': 'Composer' })]),
})

let navigated: string[] = []
const Search = defineComponent({
  props: { deps: Object, focusTick: Number, navigate: Function, close: Function },
  setup(props: CommandProps<unknown>) {
    const field = ref<HTMLInputElement | null>(null)
    onMounted(() => field.value?.focus())
    watch(
      () => props.focusTick,
      () => field.value?.focus(),
    )
    return () =>
      h('div', { role: 'dialog', 'aria-label': 'Busca' }, [
        h('input', {
          ref: field,
          'aria-label': 'Buscar',
          onKeydown: (event: KeyboardEvent) => {
            if (event.key === 'Escape') props.close()
            if (event.key === 'Enter') {
              navigated.push('/other')
              props.navigate('/other')
              props.close()
            }
          },
        }),
      ])
  },
})

const modules = (): ModuleDescriptor<VueModule>[] => [
  { id: 'daily-log', title: 'Daily Log', route: '/', load: async () => ({ component: Home }) },
  {
    id: 'other',
    title: 'Other',
    route: '/other',
    commands: [{ id: 'search', shortcut: { key: 'k', mod: true } }],
    load: async () => ({ component: defineComponent({ setup: () => () => h('p', { 'data-marker': 'other' }) }), commands: { search: Search } }),
  },
]

const ctrlK = (target: EventTarget = window) => {
  const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}
const dialog = () => host.querySelector<HTMLElement>('[role="dialog"][aria-label="Busca"]')

describe('C1: Ctrl+K abre a busca em qualquer tela (J10.1)', () => {
  it('abre a busca sobre o Daily Log, com o foco no campo', async () => {
    shell = await mountShell(host, { modules: modules(), deps: testShellDeps() })

    const event = ctrlK()
    await settle()

    expect(event.defaultPrevented).toBe(true)
    expect(dialog()).not.toBeNull()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Buscar')
    expect(shell.current).toBe('/')
  })

  it('Meta+K também abre, e Ctrl+K com a busca aberta só devolve o foco ao campo', async () => {
    shell = await mountShell(host, { modules: modules(), deps: testShellDeps() })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true }))
    await settle()
    expect(dialog()).not.toBeNull()

    ;(document.activeElement as HTMLElement).blur()
    ctrlK()
    await settle()

    expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Buscar')
  })
})

describe('C2: Ctrl+K vale dentro de um campo de texto (RN15)', () => {
  it('abre a busca, e o composer continua com "reunião", sem um "k" a mais', async () => {
    shell = await mountShell(host, { modules: modules(), deps: testShellDeps() })
    const composer = host.querySelector<HTMLTextAreaElement>('textarea')!
    composer.value = 'reunião'
    composer.focus()

    const event = ctrlK(composer)
    await settle()

    expect(event.defaultPrevented).toBe(true)
    expect(dialog()).not.toBeNull()
    expect(composer.value).toBe('reunião')
  })
})

describe('C3: Esc fecha a busca e devolve o foco (J10.1a)', () => {
  it('a busca fecha e o foco volta ao composer', async () => {
    shell = await mountShell(host, { modules: modules(), deps: testShellDeps() })
    const composer = host.querySelector<HTMLTextAreaElement>('textarea')!
    composer.focus()
    ctrlK(composer)
    await settle()

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()

    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(composer)
  })
})

describe('the command reaches another module', () => {
  it('navigate() goes to the route, and close() takes the layer away', async () => {
    navigated = []
    shell = await mountShell(host, { modules: modules(), deps: testShellDeps() })
    ctrlK()
    await settle()

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await settle()

    expect(shell.current).toBe('/other')
    expect(host.querySelector('[data-marker="other"]')).not.toBeNull()
    expect(dialog()).toBeNull()
  })

  it('a key no command declares does nothing', async () => {
    shell = await mountShell(host, { modules: modules(), deps: testShellDeps() })
    const event = new KeyboardEvent('keydown', { key: 'j', ctrlKey: true, cancelable: true })
    window.dispatchEvent(event)
    await settle()
    expect(event.defaultPrevented).toBe(false)
    expect(dialog()).toBeNull()
  })
})

describe('gate #47: the layer keeps the focus and closes from anywhere', () => {
  it('takes back the focus that leaves it, and Esc or a click outside closes it', async () => {
    shell = await mountShell(host, { modules: modules(), deps: testShellDeps() })
    const composer = host.querySelector<HTMLTextAreaElement>('textarea')!
    composer.focus()
    ctrlK(composer)
    await settle()

    composer.focus()
    await settle()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Buscar')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(composer)

    ctrlK(composer)
    await settle()
    host.querySelector<HTMLElement>('[data-testid="command"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await settle()
    expect(dialog()).toBeNull()
  })

  it('a click inside the command does not close it, and Ctrl+Shift+K is not Ctrl+K', async () => {
    shell = await mountShell(host, { modules: modules(), deps: testShellDeps() })
    const shifted = new KeyboardEvent('keydown', { key: 'K', ctrlKey: true, shiftKey: true, cancelable: true })
    window.dispatchEvent(shifted)
    await settle()
    expect(shifted.defaultPrevented).toBe(false)
    expect(dialog()).toBeNull()

    ctrlK()
    await settle()
    dialog()!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await settle()
    expect(dialog()).not.toBeNull()
  })
})
