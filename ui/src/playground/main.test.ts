// @vitest-environment jsdom
/**
 * The demo is the first thing anyone touches, so its wiring is exercised for
 * real rather than only build-checked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WhiteboardDocument } from '@dailly/whiteboard-core'

async function loadDemo() {
  document.body.innerHTML = '<div id="whiteboard"></div>'
  vi.resetModules()
  await import('./main.js')

  return {
    board: document.querySelector('#whiteboard') as HTMLElement,
    store: (globalThis as { dailly?: WhiteboardDocument }).dailly!,
  }
}

const caretAt = (el: HTMLElement, offset: number) => {
  const node = el.firstChild ?? el.appendChild(document.createTextNode(''))
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  const selection = document.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
}

beforeEach(() => {
  vi.resetModules()
})

describe('demo page', () => {
  it('renders the sample document', async () => {
    const { board } = await loadDemo()
    expect(board.querySelector('h1')?.textContent).toBe('Daily 14/09')
    expect(board.querySelectorAll('input[type=checkbox]')).toHaveLength(2)
  })

  it('shows only the board — no source or markdown panes', async () => {
    await loadDemo()
    expect(document.querySelector('#source')).toBeNull()
    expect(document.querySelector('#output')).toBeNull()
  })

  it('keeps the document reachable for the console', async () => {
    const { store } = await loadDemo()
    expect(store.toMarkdown()).toContain('# Daily 14/09')
  })
})

describe('editing on the page', () => {
  it('writes typed text into the document', async () => {
    const { board, store } = await loadDemo()

    const text = board.querySelector('[data-wb-text]') as HTMLElement
    text.textContent = 'Daily editada'
    text.dispatchEvent(new Event('input', { bubbles: true }))

    expect(store.blocks[0]?.text).toBe('Daily editada')
    expect(store.toMarkdown()).toContain('# Daily editada')
  })

  it('turns a typed shortcut into a real block', async () => {
    const { board, store } = await loadDemo()

    const paragraph = Array.from(board.querySelectorAll<HTMLElement>('.wb-block--paragraph')).at(-1)!
    const id = paragraph.getAttribute('data-wb-id')!
    const text = paragraph.querySelector('[data-wb-text]') as HTMLElement

    text.textContent = '## '
    caretAt(text, 3)
    text.dispatchEvent(new Event('input', { bubbles: true }))

    // the conversion re-renders, so the old node is detached by now
    const converted = board.querySelector(`[data-wb-id="${id}"]`)
    expect(converted?.getAttribute('data-wb-type')).toBe('heading')
    expect(store.toMarkdown()).toContain('##')
  })

  it('still toggles a checkbox from the board', async () => {
    const { board, store } = await loadDemo()

    board.querySelector<HTMLInputElement>('input[type=checkbox]')!.click()
    expect(store.toMarkdown()).toContain('[x] daily meeting')
  })
})
