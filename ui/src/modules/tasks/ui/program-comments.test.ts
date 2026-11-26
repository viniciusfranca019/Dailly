// @vitest-environment jsdom
import { TEXT_ATTR } from '@capabilities/whiteboard/dom'
import type { TaskStore } from '@dailly/tasks-core'
import { inMemoryTaskStore } from '@dailly/tasks-core/testing'
import type { ProgramsPort, TasksPort } from '@shared'
import { programsOver, testSharedDeps } from '@shared/testing.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, type App } from 'vue'
import Tasks from './Tasks.vue'

/**
 * programa-comentarios C7 and C8: a program's comments in the Programas view,
 * the same list and editor as a task's (card #45). C1 to C5 are the API's,
 * pinned in `server/src/programs-comments.test.ts`; C6 is the MCP's.
 */
const settle = async () => {
  for (let n = 0; n < 6; n += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

let app: App | undefined
afterEach(() => {
  localStorage.clear()
  app?.unmount()
  document.body.innerHTML = ''
})

/** "Dailly v1", the clock moving a minute per call from 17:31 UTC. */
async function world(): Promise<{ store: TaskStore; dailly: string }> {
  let n = 0
  let minute = 30
  const store = inMemoryTaskStore({
    newId: () => `id-${(n += 1)}`,
    now: () => `2026-11-05T17:${String((minute += 1)).padStart(2, '0')}:00.000Z`,
  })
  const program = await store.createProgram({ name: 'Dailly v1', objective: '', windowStart: null, windowEnd: null, exitWhen: '' })
  return { store, dailly: program.id }
}

const tasksOver = (store: TaskStore): TasksPort => ({
  boards: () => store.boards(),
  createBoard: (input) => store.createBoard(input),
  updateBoard: (id, patch) => store.updateBoard(id, patch),
  board: (boardId) => store.board(boardId),
  create: (input) => store.create(input),
  update: (key, patch) => store.update(key, patch),
  delete: (key) => store.delete(key),
  comments: (key) => store.comments(key),
  addComment: (key, body) => store.addComment(key, body),
  deleteComment: async (key, id) => (await store.deleteComment(key, id)) === 'deleted',
  addStatus: (boardId, input) => store.addStatus(boardId, input),
  updateStatus: (id, patch) => store.updateStatus(id, patch),
  deleteStatus: (id, moveTo) => store.deleteStatus(id, moveTo),
  search: (text) => store.search(text),
})

async function mount(store: TaskStore, over: Partial<ProgramsPort> = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const programs = { ...programsOver(store), ...over }
  app = createApp(Tasks, { deps: { ...testSharedDeps({ zone: 'America/Sao_Paulo' }), tasks: tasksOver(store), programs } })
  app.mount(host)
  await settle()
  const views = host.querySelector<HTMLElement>('[aria-label="Visualização"]')!
  ;[...views.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Programas')!.click()
  await settle()
  return host
}

const card = (host: HTMLElement) => host.querySelector<HTMLElement>('[aria-label="Programa Dailly v1"]')!
const buttonIn = (root: HTMLElement | null, label: string) =>
  [...(root?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
  ) ?? null
const section = (host: HTMLElement) => card(host).querySelector<HTMLElement>('section[aria-label="Comentários"]')
const listed = (host: HTMLElement) =>
  [...(section(host)?.querySelectorAll<HTMLElement>('li') ?? [])].map((li) => li.textContent?.replace(/\s+/g, ' ').trim())
const editor = (host: HTMLElement) =>
  section(host)?.querySelector<HTMLElement>(`[data-testid="comment-editor"] [${TEXT_ATTR}]`) ?? null

async function openComments(host: HTMLElement) {
  buttonIn(card(host), 'Comentários de Dailly v1')!.click()
  await settle()
}
function write(host: HTMLElement, text: string) {
  const block = editor(host)!
  block.textContent = text
  block.dispatchEvent(new Event('input', { bubbles: true }))
}
async function send(host: HTMLElement) {
  buttonIn(section(host), 'Comentar')!.click()
  await settle()
}

describe('C7: Comentar pela tela', () => {
  it('os comentários ficam fechados até abrir "Comentários" do "Dailly v1"', async () => {
    const { store } = await world()
    const host = await mount(store)

    expect(section(host)).toBeNull()
    expect(buttonIn(card(host), 'Comentários de Dailly v1')?.getAttribute('aria-expanded')).toBe('false')
    await openComments(host)
    expect(section(host)).not.toBeNull()
    expect(buttonIn(card(host), 'Comentários de Dailly v1')?.getAttribute('aria-expanded')).toBe('true')
  })

  it('"ele vem quinta" aparece no fim, com a data e a hora no fuso, e o editor fica vazio', async () => {
    const { store, dailly } = await world()
    await store.addProgramComment(dailly, 'liguei pro encanador')
    const host = await mount(store)
    await openComments(host)

    write(host, 'ele vem quinta')
    await send(host)

    const [first, second] = listed(host)
    expect(first).toContain('liguei pro encanador')
    expect(first).toContain('05/11 14:31')
    expect(second).toContain('ele vem quinta')
    expect(second).toContain('05/11 14:32')
    expect(editor(host)?.textContent ?? '').toBe('')
    expect((await store.programComments(dailly))?.map((c) => c.body)).toEqual(['liguei pro encanador', 'ele vem quinta'])
  })

  it('Ctrl+Enter no editor envia', async () => {
    const { store, dailly } = await world()
    const host = await mount(store)
    await openComments(host)

    write(host, 'ele vem quinta')
    editor(host)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
    await settle()

    expect((await store.programComments(dailly))?.map((c) => c.body)).toEqual(['ele vem quinta'])
  })

  it.each(['', '   ', '\n\n'])('com %j, nada é enviado', async (text) => {
    const { store } = await world()
    let calls = 0
    const host = await mount(store, {
      addProgramComment: async () => {
        calls += 1
        return null
      },
    })
    await openComments(host)

    write(host, text)
    await send(host)

    expect(calls).toBe(0)
  })
})

describe('C8: Apagar pela tela, e a API fora não perde o texto', () => {
  it('o ✕ e "Apagar comentário" tiram "ele vem quinta"', async () => {
    const { store, dailly } = await world()
    await store.addProgramComment(dailly, 'ele vem quinta')
    const host = await mount(store)
    await openComments(host)

    buttonIn(section(host), 'Apagar comentário')!.click()
    await settle()
    buttonIn(section(host)!.querySelector('[role="alertdialog"]'), 'Apagar comentário')!.click()
    await settle()

    expect(listed(host)).toEqual([])
    expect(await store.programComments(dailly)).toEqual([])
  })

  it('cancelar não muda nada', async () => {
    const { store, dailly } = await world()
    await store.addProgramComment(dailly, 'ele vem quinta')
    const host = await mount(store)
    await openComments(host)

    buttonIn(section(host), 'Apagar comentário')!.click()
    await settle()
    buttonIn(section(host)!.querySelector('[role="alertdialog"]'), 'Cancelar')!.click()
    await settle()

    expect(listed(host)).toEqual([expect.stringContaining('ele vem quinta')])
    expect(await store.programComments(dailly)).toHaveLength(1)
  })

  it('o envio que falha mostra o erro junto do editor, e "ele vem quinta" continua nele', async () => {
    const { store } = await world()
    const host = await mount(store, {
      addProgramComment: async () => {
        throw new Error('não consegui falar com a API local')
      },
    })
    await openComments(host)

    write(host, 'ele vem quinta')
    await send(host)

    expect(section(host)?.querySelector('[role="alert"]')?.textContent).toContain('não consegui falar com a API local')
    expect(editor(host)?.textContent).toBe('ele vem quinta')
  })
})

describe('programa-comentarios: o programa que sumiu', () => {
  it('fecha os comentários e diz "programa não encontrado" no cartão', async () => {
    const { store } = await world()
    const host = await mount(store, { programComments: async () => null })
    await openComments(host)

    expect(section(host)).toBeNull()
    expect(card(host).querySelector('[role="alert"]')?.textContent).toContain('programa não encontrado')
  })
})
