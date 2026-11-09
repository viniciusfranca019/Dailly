// @vitest-environment jsdom
import { SEED_BOARD, type Task, type TaskStore } from '@dailly/tasks-core'
import { inMemoryTaskStore } from '@dailly/tasks-core/testing'
import type { TasksPort } from '@shared'
import { testSharedDeps } from '@shared/testing.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, type App } from 'vue'
import { onTaskCreated } from '../model/created.js'
import QuickCreate from './create/QuickCreate.vue'

/**
 * Card #48 (F10), the form itself: C1's form, C3 to C6. C1's shortcut and C2
 * are the shell's seam (`shell/quick-create.test.ts`); the form across the
 * shell, on the Daily Log and on the Tasks, is `shell/tasks-quick-create.test.ts`.
 */
const settle = async () => {
  for (let n = 0; n < 6; n += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

let app: App | undefined
afterEach(() => {
  localStorage.clear()
  app?.unmount()
  app = undefined
  document.body.innerHTML = ''
})

/** The board "Casa" with CASA-1 in "A fazer", and "Casa" as the last board used. */
async function seeded(): Promise<{ store: TaskStore; casa: string; todo: string }> {
  let n = 0
  const store = inMemoryTaskStore({ newId: () => `id-${(n += 1)}`, now: () => '2026-11-09T12:00:00.000Z' })
  const casa = (await store.createBoard({ name: 'Casa', prefix: 'CASA' })).id
  const todo = (await store.board(casa))!.statuses.find((status) => status.name === 'A fazer')!.id
  await store.create({ boardId: casa, title: 'Lixar a parede', statusId: todo })
  localStorage.setItem('dailly.tasks.board', casa)
  return { store, casa, todo }
}

const port = (store: TaskStore, over: Partial<TasksPort> = {}): Partial<TasksPort> => ({
  boards: () => store.boards(),
  board: (id) => store.board(id),
  create: (input) => store.create(input),
  ...over,
})

async function mountForm(tasks: Partial<TasksPort>) {
  const calls = { closed: 0, notices: [] as string[] }
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp(QuickCreate, {
    deps: { ...testSharedDeps(), tasks },
    focusTick: 0,
    navigate: () => undefined,
    close: () => (calls.closed += 1),
    notify: (text: string) => calls.notices.push(text),
  })
  app.mount(host)
  await settle()
  return { host, calls }
}

const title = (host: HTMLElement) => host.querySelector<HTMLInputElement>('input[aria-label="Título"]')!
const select = (host: HTMLElement, name: string) => host.querySelector<HTMLSelectElement>(`select[aria-label="${name}"]`)!
const chosen = (element: HTMLSelectElement) => element.selectedOptions[0]?.textContent?.trim()
const confirm = async (host: HTMLElement) => {
  host.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
  await settle()
}

describe('C1: C abre o formulário no último board usado (J11.1, RN15)', () => {
  it('abre no board "Casa", com o foco no título vazio, o status "A fazer" e a prioridade "sem"', async () => {
    const { store } = await seeded()
    const { host } = await mountForm(port(store))

    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Nova tarefa em Casa')
    expect(document.activeElement).toBe(title(host))
    expect(title(host).value).toBe('')
    expect(chosen(select(host, 'Status'))).toBe('A fazer')
    expect(chosen(select(host, 'Prioridade'))).toBe('sem')
  })

  it('sem board lembrado, ou com um que não existe mais, abre no primeiro ("Tasks")', async () => {
    const { store } = await seeded()
    localStorage.setItem('dailly.tasks.board', 'gone')
    const { host } = await mountForm(port(store))

    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(`Nova tarefa em ${SEED_BOARD.name}`)
  })
})

describe('C3: Confirmar cria no topo do status escolhido (J11.2)', () => {
  it('fecha, e CASA-2 "Comprar tinta" entra no topo de "A fazer", com a prioridade "alta"', async () => {
    const { store, casa, todo } = await seeded()
    const announced: Task[] = []
    const stop = onTaskCreated((task) => {
      announced.push(task)
      return false
    })
    const { host, calls } = await mountForm(port(store))

    title(host).value = 'Comprar tinta'
    title(host).dispatchEvent(new Event('input'))
    select(host, 'Prioridade').value = '2'
    select(host, 'Prioridade').dispatchEvent(new Event('change'))
    await confirm(host)
    stop()

    const read = (await store.board(casa))!
    expect(read.tasks.filter((task) => task.statusId === todo).map((task) => [task.keyPrefix, task.key, task.title, task.priority])).toEqual([
      ['CASA', 2, 'Comprar tinta', 2],
      ['CASA', 1, 'Lixar a parede', 0],
    ])
    expect(calls.closed).toBe(1)
    expect(announced.map((task) => task.key)).toEqual([2])
  })

  it('o aviso "CASA-2 criada" sai quando nenhum board na tela leva a tarefa, e não sai quando leva', async () => {
    const { store } = await seeded()
    const first = await mountForm(port(store))
    title(first.host).value = 'Comprar tinta'
    title(first.host).dispatchEvent(new Event('input'))
    await confirm(first.host)
    expect(first.calls.notices).toEqual(['CASA-2 criada'])
    app?.unmount()

    const stop = onTaskCreated(() => true)
    const second = await mountForm(port(store))
    title(second.host).value = 'Lavar o pincel'
    title(second.host).dispatchEvent(new Event('input'))
    await confirm(second.host)
    stop()
    expect(second.calls.notices).toEqual([])
    expect(second.calls.closed).toBe(1)
  })
})

describe('C4: Título vazio é recusado (J11.2a)', () => {
  it('vê "o título é obrigatório", o formulário continua aberto e nenhuma tarefa é criada', async () => {
    const { store, casa } = await seeded()
    const { host, calls } = await mountForm(port(store))

    title(host).value = '   '
    title(host).dispatchEvent(new Event('input'))
    await confirm(host)

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('o título é obrigatório')
    expect(calls.closed).toBe(0)
    expect((await store.board(casa))!.tasks).toHaveLength(1)
  })
})

describe('C5: A API fora não perde o título (J11.2b)', () => {
  it('vê o erro no formulário, e "Comprar tinta" continua no título', async () => {
    const { store } = await seeded()
    const { host, calls } = await mountForm(
      port(store, {
        create: async () => {
          throw new Error('não consegui falar com a API local')
        },
      }),
    )

    title(host).value = 'Comprar tinta'
    title(host).dispatchEvent(new Event('input'))
    await confirm(host)

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('não consegui falar com a API local')
    expect(title(host).value).toBe('Comprar tinta')
    expect(calls.closed).toBe(0)
  })

  it('a API fora ao abrir também diz o erro no formulário', async () => {
    const { host } = await mountForm({
      boards: async () => {
        throw new Error('não consegui falar com a API local')
      },
      board: async () => null,
      create: async () => {
        throw new Error('unreachable')
      },
    })

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('não consegui falar com a API local')
  })
})

describe('C6: Esc fecha sem criar', () => {
  it('o formulário fecha e nenhuma tarefa é criada', async () => {
    const { store, casa } = await seeded()
    const { host, calls } = await mountForm(port(store))
    title(host).value = 'Comprar tinta'
    title(host).dispatchEvent(new Event('input'))

    title(host).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await settle()

    expect(calls.closed).toBe(1)
    expect((await store.board(casa))!.tasks).toHaveLength(1)
  })
})
