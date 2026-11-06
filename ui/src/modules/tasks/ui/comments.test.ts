// @vitest-environment jsdom
import { TEXT_ATTR } from '@capabilities/whiteboard/dom'
import { SEED_BOARD, type TaskStore } from '@dailly/tasks-core'
import { inMemoryTaskStore } from '@dailly/tasks-core/testing'
import type { TasksPort } from '@shared'
import { testSharedDeps } from '@shared/testing.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, type App } from 'vue'
import Tasks from './Tasks.vue'

/**
 * Card #45 (F7), the comments in the panel: C1, C2, C4, C5 and C6 on the
 * screen. C3 and C7 are the API's, pinned in `server/src/tasks-comments.test.ts`.
 */
const settle = async () => {
  for (let n = 0; n < 4; n += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

let app: App | undefined
afterEach(() => {
  localStorage.clear()
  app?.unmount()
  document.body.innerHTML = ''
})

const T1 = { prefix: 'T', key: 1 }

/** The store with T-1, its clock moving a minute per call from 17:31 UTC. */
async function storeWithT1(): Promise<TaskStore> {
  let n = 0
  let minute = 30
  const store = inMemoryTaskStore({
    newId: () => `id-${(n += 1)}`,
    now: () => `2026-11-05T17:${String((minute += 1)).padStart(2, '0')}:00.000Z`,
  })
  await store.create({ boardId: SEED_BOARD.id, title: 'Chamar o encanador', statusId: 'todo' })
  return store
}

const portOver = (store: TaskStore, over: Partial<TasksPort> = {}): TasksPort => ({
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
  ...over,
})

async function mount(tasks: TasksPort) {
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp(Tasks, { deps: { ...testSharedDeps({ zone: 'America/Sao_Paulo' }), tasks } })
  app.mount(host)
  await settle()
  return host
}

const panel = (host: HTMLElement) => host.querySelector<HTMLElement>('[role="dialog"]')
const section = (host: HTMLElement) => panel(host)?.querySelector<HTMLElement>('section[aria-label="Comentários"]') ?? null
const listed = (host: HTMLElement) =>
  [...(section(host)?.querySelectorAll<HTMLElement>('li') ?? [])].map((li) => li.textContent?.replace(/\s+/g, ' ').trim())
const buttonIn = (root: HTMLElement | null, label: string) =>
  [...(root?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
  ) ?? null
const editor = (host: HTMLElement) =>
  section(host)?.querySelector<HTMLElement>(`[data-testid="comment-editor"] [${TEXT_ATTR}]`) ?? null

async function openT1(host: HTMLElement): Promise<void> {
  const card = [...host.querySelectorAll<HTMLElement>('section li')].find((li) => li.textContent?.includes('T-1'))!
  card.click()
  await settle()
}

function write(host: HTMLElement, text: string): void {
  const block = editor(host)!
  block.textContent = text
  block.dispatchEvent(new Event('input', { bubbles: true }))
}

async function comment(host: HTMLElement): Promise<void> {
  buttonIn(section(host), 'Comentar')!.click()
  await settle()
}

describe('C1: Comentar a tarefa', () => {
  it('"ele vem quinta" aparece depois de "liguei pro encanador", com a data e a hora no fuso, e o editor fica vazio', async () => {
    const store = await storeWithT1()
    await store.addComment(T1, 'liguei pro encanador')
    const host = await mount(portOver(store))
    await openT1(host)

    write(host, 'ele vem quinta')
    await comment(host)

    const [first, second] = listed(host)
    expect(first).toContain('liguei pro encanador')
    expect(first).toContain('05/11 14:32')
    expect(second).toContain('ele vem quinta')
    expect(second).toContain('05/11 14:33')
    expect(editor(host)?.textContent ?? '').toBe('')
  })

  it('Ctrl+Enter no editor de comentário envia', async () => {
    const store = await storeWithT1()
    const host = await mount(portOver(store))
    await openT1(host)

    write(host, 'ele vem quinta')
    editor(host)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
    await settle()

    expect((await store.comments(T1))?.map((c) => c.body)).toEqual(['ele vem quinta'])
    expect(listed(host)).toEqual([expect.stringContaining('ele vem quinta')])
  })
})

describe('C2: Comentário vazio não é enviado', () => {
  it.each(['', '   ', '\n\n'])('com %j, nada é enviado e a lista continua igual', async (text) => {
    const store = await storeWithT1()
    await store.addComment(T1, 'liguei pro encanador')
    let calls = 0
    const host = await mount(
      portOver(store, {
        addComment: async (key, body) => {
          calls += 1
          return store.addComment(key, body)
        },
      }),
    )
    await openT1(host)

    write(host, text)
    await comment(host)

    expect(calls).toBe(0)
    expect(listed(host)).toEqual([expect.stringContaining('liguei pro encanador')])
  })
})

describe('C4: A API fora não perde o comentário', () => {
  it('mostra o erro junto do editor, e "ele vem quinta" continua nele', async () => {
    const store = await storeWithT1()
    const host = await mount(
      portOver(store, {
        addComment: async () => {
          throw new Error('não consegui falar com a API local')
        },
      }),
    )
    await openT1(host)

    write(host, 'ele vem quinta')
    await comment(host)

    expect(section(host)?.querySelector('[role="alert"]')?.textContent).toContain('não consegui falar com a API local')
    expect(editor(host)?.textContent).toBe('ele vem quinta')
    expect(listed(host)).toEqual([])
  })
})

describe('C5: Apagar um comentário', () => {
  it('some da lista, e reabrir o painel de T-1 não o traz de volta', async () => {
    const store = await storeWithT1()
    await store.addComment(T1, 'ele vem quinta')
    const host = await mount(portOver(store))
    await openT1(host)

    buttonIn(section(host), 'Apagar comentário')!.click()
    await settle()
    const confirm = section(host)!.querySelector<HTMLElement>('[role="alertdialog"]')!
    buttonIn(confirm, 'Apagar comentário')!.click()
    await settle()

    expect(listed(host)).toEqual([])
    buttonIn(panel(host), 'Fechar')!.click()
    await settle()
    await openT1(host)
    expect(listed(host)).toEqual([])
    expect(await store.comments(T1)).toEqual([])
  })
})

describe('C6: Desistir de apagar o comentário', () => {
  it('nada muda, e "ele vem quinta" continua na lista', async () => {
    const store = await storeWithT1()
    await store.addComment(T1, 'ele vem quinta')
    const host = await mount(portOver(store))
    await openT1(host)

    buttonIn(section(host), 'Apagar comentário')!.click()
    await settle()
    buttonIn(section(host)!.querySelector('[role="alertdialog"]'), 'Cancelar')!.click()
    await settle()

    expect(section(host)?.querySelector('[role="alertdialog"]')).toBeNull()
    expect(listed(host)).toEqual([expect.stringContaining('ele vem quinta')])
    expect(await store.comments(T1)).toHaveLength(1)
  })
})

describe('#45: os comentários de uma tarefa apagada', () => {
  it('mostram "tarefa não encontrada" com o caminho de volta ao board', async () => {
    const store = await storeWithT1()
    const host = await mount(
      portOver(store, {
        comments: async () => null,
      }),
    )
    await openT1(host)

    expect(panel(host)?.textContent).toContain('tarefa não encontrada')
    expect(buttonIn(panel(host), 'Voltar ao board')).not.toBeNull()
  })
})
