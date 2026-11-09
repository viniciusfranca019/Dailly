// @vitest-environment jsdom
import type { CommandProps, ModuleDescriptor, VueModule } from '@shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, onMounted, ref } from 'vue'
import { mountShell, type ShellHandle } from './mount.js'
import { testShellDeps } from './testing.js'

/**
 * The shell's half of card #48 (F10): a command on a bare letter. C opens it
 * outside a field (C1), is text inside one (C2, RN15) and inside an open
 * command, and the command can leave a short notice that outlives its layer.
 * The form itself is pinned in the Tasks module (`ui/quick-create.test.ts`).
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

const Create = defineComponent({
  props: { deps: Object, focusTick: Number, navigate: Function, close: Function, notify: Function },
  setup(props: CommandProps<unknown>) {
    const field = ref<HTMLInputElement | null>(null)
    onMounted(() => field.value?.focus())
    return () =>
      h('div', { role: 'dialog', 'aria-label': 'Nova tarefa' }, [
        h('input', { ref: field, 'aria-label': 'Título' }),
        h(
          'button',
          {
            type: 'button',
            onClick: () => {
              props.notify('CASA-2 criada')
              props.close()
            },
          },
          'Criar',
        ),
      ])
  },
})

const modules = (): ModuleDescriptor<VueModule>[] => [
  { id: 'daily-log', title: 'Daily Log', route: '/', load: async () => ({ component: Home }) },
  {
    id: 'tasks',
    title: 'Tasks',
    route: '/tasks',
    commands: [{ id: 'create', shortcut: { key: 'c' } }],
    load: async () => ({ component: defineComponent({ setup: () => () => h('p') }), commands: { create: Create } }),
  },
]

const press = (init: KeyboardEventInit, target: EventTarget = document.body) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}
const dialogs = () => host.querySelectorAll('[role="dialog"][aria-label="Nova tarefa"]')

describe('C1: C abre o formulário fora de um campo de texto (J11.1, RN15)', () => {
  it('c e C (com Shift) abrem, com o foco no título', async () => {
    for (const init of [{ key: 'c' }, { key: 'C', shiftKey: true }]) {
      shell = await mountShell(host, { modules: modules(), deps: testShellDeps() })

      const event = press(init)
      await settle()

      expect(event.defaultPrevented, init.key).toBe(true)
      expect(dialogs()).toHaveLength(1)
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Título')
      shell.destroy()
      shell = undefined
    }
  })

  it('Ctrl+C, Meta+C e Alt+C não abrem: Ctrl+C é copiar', async () => {
    shell = await mountShell(host, { modules: modules(), deps: testShellDeps() })
    for (const init of [{ key: 'c', ctrlKey: true }, { key: 'c', metaKey: true }, { key: 'c', altKey: true }]) {
      const event = press(init)
      await settle()
      expect(event.defaultPrevented, JSON.stringify(init)).toBe(false)
    }
    expect(dialogs()).toHaveLength(0)
  })
})

describe('C2: C dentro de um campo de texto é texto (J11.1a, RN15)', () => {
  it('no composer, o c não é tomado e o formulário não abre', async () => {
    shell = await mountShell(host, { modules: modules(), deps: testShellDeps() })
    const composer = host.querySelector<HTMLTextAreaElement>('textarea')!
    composer.focus()

    const event = press({ key: 'c' }, composer)
    await settle()

    expect(event.defaultPrevented).toBe(false)
    expect(dialogs()).toHaveLength(0)
  })

  it('com o formulário aberto, o C é dele, mesmo com o foco num botão', async () => {
    shell = await mountShell(host, { modules: modules(), deps: testShellDeps() })
    press({ key: 'c' })
    await settle()
    const button = dialogs()[0]!.querySelector<HTMLButtonElement>('button')!
    button.focus()

    const event = press({ key: 'c' }, button)
    await settle()

    expect(event.defaultPrevented).toBe(false)
    expect(dialogs()).toHaveLength(1)
    expect(document.activeElement).toBe(button)
  })
})

describe('#48: o aviso curto do comando fica depois de ele fechar', () => {
  it('notify() mostra "CASA-2 criada" na tela, com o formulário já fechado', async () => {
    shell = await mountShell(host, { modules: modules(), deps: testShellDeps() })
    press({ key: 'c' })
    await settle()

    dialogs()[0]!.querySelector<HTMLButtonElement>('button')!.click()
    await settle()

    expect(dialogs()).toHaveLength(0)
    expect(host.querySelector('[role="status"]')?.textContent).toBe('CASA-2 criada')
  })
})

describe('gate #48: o close de um comando que já fechou não fecha o que abriu depois', () => {
  it('a resposta lenta do primeiro formulário não leva o segundo, nem o que se digitou nele', async () => {
    let finish: (() => void) | undefined
    const Slow = defineComponent({
      props: { deps: Object, focusTick: Number, navigate: Function, close: Function, notify: Function },
      setup(props: CommandProps<unknown>) {
        return () =>
          h('div', { role: 'dialog', 'aria-label': 'Nova tarefa' }, [
            h('input', { 'aria-label': 'Título' }),
            h(
              'button',
              {
                type: 'button',
                // The create in flight: the reply closes the form when it arrives.
                onClick: () => {
                  finish = () => props.close()
                },
              },
              'Criar',
            ),
          ])
      },
    })
    const slow = modules()
    slow[1] = { ...slow[1]!, load: async () => ({ component: defineComponent({ setup: () => () => h('p') }), commands: { create: Slow } }) }
    shell = await mountShell(host, { modules: slow, deps: testShellDeps() })
    press({ key: 'c' })
    await settle()
    dialogs()[0]!.querySelector<HTMLButtonElement>('button')!.click()
    press({ key: 'Escape' }, window)
    await settle()
    press({ key: 'c' })
    await settle()
    dialogs()[0]!.querySelector<HTMLInputElement>('input')!.value = 'Lavar o pincel'

    finish!()
    await settle()

    expect(dialogs()).toHaveLength(1)
    expect(dialogs()[0]!.querySelector<HTMLInputElement>('input')!.value).toBe('Lavar o pincel')
  })
})
