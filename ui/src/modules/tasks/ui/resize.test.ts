// @vitest-environment jsdom
import type { TaskStore } from '@dailly/tasks-core'
import { inMemoryTaskStore } from '@dailly/tasks-core/testing'
import type { TasksPort } from '@shared'
import { testSharedDeps } from '@shared/testing.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, type App } from 'vue'
import Tasks from './Tasks.vue'

/** Card #44, C1 to C5: the task panel is resized by dragging its left edge. */
const settle = async () => {
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

let app: App | undefined
beforeEach(() => localStorage.clear())
afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
})

async function mount(): Promise<HTMLElement> {
  let n = 0
  const store: TaskStore = inMemoryTaskStore({ newId: () => `id-${(n += 1)}`, now: () => '2026-11-05T12:00:00.000Z' })
  await store.create({ boardId: 'tasks', title: 'Comprar café', statusId: 'todo' })
  await store.create({ boardId: 'tasks', title: 'Lavar a louça', statusId: 'todo' })
  const tasks: TasksPort = {
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
  }
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp(Tasks, { deps: { ...testSharedDeps(), tasks } })
  app.mount(host)
  await settle()
  return host
}

const panel = (host: HTMLElement) => host.querySelector<HTMLElement>('[role="dialog"]')
const handle = (host: HTMLElement) =>
  panel(host)!.querySelector<HTMLElement>('[role="separator"][aria-label="Redimensionar o painel"]')!
const width = (host: HTMLElement) => panel(host)!.style.width

async function open(host: HTMLElement, key: string) {
  const card = [...host.querySelectorAll<HTMLElement>('section li')].find((li) => li.textContent?.includes(key))
  card!.click()
  await settle()
}

async function close(host: HTMLElement) {
  const button = [...panel(host)!.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === 'Fechar',
  )
  button!.click()
  await settle()
}

/** jsdom has no PointerEvent: a MouseEvent of the pointer type carries clientX the same way. */
const pointer = (type: string, clientX: number) => new MouseEvent(type, { clientX, bubbles: true })

async function drag(host: HTMLElement, from: number, to: number, { release = true } = {}) {
  const edge = handle(host)
  edge.dispatchEvent(pointer('pointerdown', from))
  edge.dispatchEvent(pointer('pointermove', to))
  await settle()
  if (release) {
    edge.dispatchEvent(pointer('pointerup', to))
    await settle()
  }
}

describe('Tasks, resizable panel (card #44)', () => {
  it('C1: dragging the edge 100 px to the left follows the mouse and leaves 676 px', async () => {
    const host = await mount()
    await open(host, 'T-1')
    expect(width(host)).toBe('576px')

    await drag(host, 1000, 900, { release: false })
    expect(width(host)).toBe('676px')
    expect(localStorage.getItem('dailly.tasks.panelWidth')).toBeNull()

    handle(host).dispatchEvent(pointer('pointerup', 900))
    await settle()
    expect(width(host)).toBe('676px')
    expect(handle(host).getAttribute('aria-valuenow')).toBe('676')
  })

  it('C2: after a reload the panel of another task opens with the chosen width', async () => {
    const first = await mount()
    await open(first, 'T-1')
    await drag(first, 1000, 900)
    await close(first)
    app?.unmount()
    document.body.innerHTML = ''

    const host = await mount()
    await open(host, 'T-2')
    expect(width(host)).toBe('676px')
  })

  it('C3: the width stops at 360 px and at 960 px, and reopens at that limit', async () => {
    const host = await mount()
    await open(host, 'T-1')
    await drag(host, 1000, 1376)
    expect(width(host)).toBe('360px')

    await drag(host, 1000, 0)
    expect(width(host)).toBe('960px')

    await close(host)
    await open(host, 'T-1')
    expect(width(host)).toBe('960px')
  })

  it('C4: a stored width wider than the window is capped by the window and kept as stored', async () => {
    localStorage.setItem('dailly.tasks.panelWidth', '960')
    const host = await mount()
    await open(host, 'T-1')
    expect(width(host)).toBe('960px')
    expect(panel(host)!.style.maxWidth).toBe('100%')
    expect(localStorage.getItem('dailly.tasks.panelWidth')).toBe('960')
  })

  it('C4: in a window narrower than the stored width, a drag starts from the width on screen', async () => {
    localStorage.setItem('dailly.tasks.panelWidth', '960')
    const host = await mount()
    await open(host, 'T-1')
    // the window caps the panel at 800 px; jsdom lays nothing out, so the box is given
    panel(host)!.getBoundingClientRect = () => ({ width: 800 }) as DOMRect

    await drag(host, 0, 100)
    expect(width(host)).toBe('700px')
    expect(localStorage.getItem('dailly.tasks.panelWidth')).toBe('700')
  })

  it('C5: with the storage refused the width holds until the reload, with no error', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!
    const refusing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      clear: () => undefined,
    }
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => refusing })
    try {
      const host = await mount()
      await open(host, 'T-1')
      await drag(host, 1000, 900)
      expect(width(host)).toBe('676px')
      expect(panel(host)!.querySelector('[role="alert"]')).toBeNull()

      app?.unmount()
      document.body.innerHTML = ''
      const again = await mount()
      await open(again, 'T-1')
      expect(width(again)).toBe('576px')
    } finally {
      Object.defineProperty(window, 'localStorage', original)
    }
  })
})
