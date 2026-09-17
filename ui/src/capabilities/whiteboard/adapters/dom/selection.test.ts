// @vitest-environment jsdom
/**
 * Block selection: Shift+Arrow to take blocks, then act on them.
 *
 * The model half lives in `@dailly/whiteboard-core` and is tested there. This
 * is the half that only exists in a browser — which keys mean what, what the
 * highlight follows, and when a selection ends.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { WhiteboardDocument } from '@dailly/whiteboard-core'
import { BLOCK_ID_ATTR, TEXT_ATTR, mountWhiteboard } from '@capabilities/whiteboard/dom'

let container: HTMLElement
let store: WhiteboardDocument

function mount(source: string) {
  document.body.innerHTML = '<div id="wb"></div>'
  container = document.querySelector('#wb') as HTMLElement
  store = new WhiteboardDocument(source)
  mountWhiteboard(container, store)
}

const textOf = (id: string) =>
  container.querySelector<HTMLElement>(`[${BLOCK_ID_ATTR}="${id}"] > .wb-row [${TEXT_ATTR}]`)!

const press = (el: HTMLElement, key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  el.dispatchEvent(event)
  return event
}

/** The blocks wearing the highlight, by their text. */
const highlighted = () =>
  [...container.querySelectorAll<HTMLElement>('.wb-block--selected')].map(
    (node) => node.querySelector<HTMLElement>(`[${TEXT_ATTR}]`)?.textContent,
  )

/** The element the adapter left the caret in. */
const focused = () => document.activeElement as HTMLElement

beforeEach(() => mount('- um\n- dois\n- três'))

describe('taking a selection with Shift+Arrow', () => {
  it('starts from the block you are in and grows downwards', () => {
    press(textOf(store.blocks[0]!.id), 'ArrowDown', { shiftKey: true })

    expect(highlighted()).toEqual(['um', 'dois'])
  })

  it('grows upwards the same way', () => {
    press(textOf(store.blocks[2]!.id), 'ArrowUp', { shiftKey: true })

    expect(highlighted()).toEqual(['dois', 'três'])
  })

  it('shrinks back when the arrow reverses', () => {
    // The anchor stays where the selection began; only the head moves.
    const first = textOf(store.blocks[0]!.id)
    press(first, 'ArrowDown', { shiftKey: true })
    press(focused(), 'ArrowDown', { shiftKey: true })
    expect(highlighted()).toEqual(['um', 'dois', 'três'])

    press(focused(), 'ArrowUp', { shiftKey: true })

    expect(highlighted()).toEqual(['um', 'dois'])
  })

  it('ignores where the caret sits inside the text', () => {
    // A plain ArrowDown only leaves the block from its last character. Block
    // selection is not about the caret, so that check must not apply here.
    mount('uma linha longa\n- outra')
    const text = textOf(store.blocks[0]!.id)
    text.focus()

    press(text, 'ArrowDown', { shiftKey: true })

    expect(highlighted()).toEqual(['uma linha longa', 'outra'])
  })

  it('stops at the end of the board instead of emptying the selection', () => {
    press(textOf(store.blocks[2]!.id), 'ArrowDown', { shiftKey: true })

    expect(highlighted()).toEqual([])
  })

  it('walks past a collapsed subtree rather than into it', () => {
    mount('- pai\n  - escondido\n- depois')
    store.toggleCollapse(store.blocks[0]!.id)

    press(textOf(store.blocks[0]!.id), 'ArrowDown', { shiftKey: true })

    // `escondido` is selected — it belongs to `pai` — but the head landed on
    // the next block a person can actually see.
    expect(highlighted()).toEqual(['pai', 'depois'])
  })

  it('takes the whole subtree when a parent is selected', () => {
    mount('- pai\n  - filho')

    press(textOf(store.blocks[0]!.id), 'ArrowDown', { shiftKey: true })

    expect(highlighted()).toEqual(['pai', 'filho'])
  })
})

describe('moving the selection with Alt+Arrow', () => {
  it('moves what is selected down', () => {
    press(textOf(store.blocks[0]!.id), 'ArrowDown', { shiftKey: true })

    press(focused(), 'ArrowDown', { altKey: true })

    expect(store.toMarkdown()).toBe('- três\n- um\n- dois')
  })

  it('moves the block you are in when nothing is selected', () => {
    // Every editor does this with a single line; a selection of one is still a
    // selection.
    press(textOf(store.blocks[2]!.id), 'ArrowUp', { altKey: true })

    expect(store.toMarkdown()).toBe('- um\n- três\n- dois')
  })

  it('keeps the highlight on the blocks, not on the positions they left', () => {
    // The trap: the class is written by `render`, so a move that repaints from
    // the store would otherwise leave the highlight behind.
    press(textOf(store.blocks[0]!.id), 'ArrowDown', { shiftKey: true })
    press(focused(), 'ArrowDown', { altKey: true })

    expect(store.toMarkdown()).toBe('- três\n- um\n- dois')
    expect(highlighted()).toEqual(['um', 'dois'])
  })

  it('does nothing at the edge of the board', () => {
    press(textOf(store.blocks[0]!.id), 'ArrowUp', { altKey: true })

    expect(store.toMarkdown()).toBe('- um\n- dois\n- três')
  })

  it('takes the key from the browser', () => {
    const event = press(textOf(store.blocks[0]!.id), 'ArrowDown', { altKey: true })
    expect(event.defaultPrevented).toBe(true)
  })
})

describe('indenting a selection', () => {
  it('Tab puts every selected block under the one above them', () => {
    press(textOf(store.blocks[1]!.id), 'ArrowDown', { shiftKey: true })

    press(focused(), 'Tab')

    expect(store.toMarkdown()).toBe('- um\n  - dois\n  - três')
  })

  it('Shift+Tab lifts them back out', () => {
    mount('- pai\n  - um\n  - dois')
    const parent = store.blocks[0]!
    press(textOf(parent.children[0]!.id), 'ArrowDown', { shiftKey: true })

    press(focused(), 'Tab', { shiftKey: true })

    expect(store.toMarkdown()).toBe('- pai\n- um\n- dois')
  })

  it('Ctrl+D does what Shift+Tab does, the way vim spells it', () => {
    mount('- pai\n  - um\n  - dois')
    const parent = store.blocks[0]!
    press(textOf(parent.children[0]!.id), 'ArrowDown', { shiftKey: true })

    press(focused(), 'd', { ctrlKey: true })

    expect(store.toMarkdown()).toBe('- pai\n- um\n- dois')
  })

  it('Ctrl+D works on the block you are in, with nothing selected', () => {
    mount('- pai\n  - filho')

    press(textOf(store.blocks[0]!.children[0]!.id), 'd', { ctrlKey: true })

    expect(store.toMarkdown()).toBe('- pai\n- filho')
  })

  it('Ctrl+D never reaches the browser, where it means "bookmark this page"', () => {
    mount('- pai\n  - filho')
    const event = press(textOf(store.blocks[0]!.children[0]!.id), 'd', { ctrlKey: true })

    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves Cmd+D alone, which is a different key on macOS', () => {
    mount('- pai\n  - filho')
    const event = press(textOf(store.blocks[0]!.children[0]!.id), 'd', { metaKey: true })

    expect(event.defaultPrevented).toBe(false)
    expect(store.toMarkdown()).toBe('- pai\n  - filho')
  })
})

describe('Ctrl+A', () => {
  it('leaves the first press to the browser, which selects the text you are in', () => {
    const event = press(textOf(store.blocks[0]!.id), 'a', { ctrlKey: true })

    expect(event.defaultPrevented).toBe(false)
    expect(highlighted()).toEqual([])
  })

  it('selects every block once the block text is already taken', () => {
    const text = textOf(store.blocks[0]!.id)
    const range = document.createRange()
    range.selectNodeContents(text)
    const domSelection = document.getSelection()!
    domSelection.removeAllRanges()
    domSelection.addRange(range)

    const event = press(text, 'a', { ctrlKey: true })

    expect(event.defaultPrevented).toBe(true)
    expect(highlighted()).toEqual(['um', 'dois', 'três'])
  })

  it('goes straight to the whole board from an empty block', () => {
    // The case the Daily Log composer opens in: there is no text to take first.
    mount('')

    const event = press(textOf(store.blocks[0]!.id), 'a', { ctrlKey: true })

    expect(event.defaultPrevented).toBe(true)
    expect(highlighted()).toEqual([''])
  })

  it('extends an existing block selection to everything', () => {
    press(textOf(store.blocks[0]!.id), 'ArrowDown', { shiftKey: true })

    press(focused(), 'a', { ctrlKey: true })

    expect(highlighted()).toEqual(['um', 'dois', 'três'])
  })
})

describe('letting go of a selection', () => {
  it('Escape clears it', () => {
    press(textOf(store.blocks[0]!.id), 'ArrowDown', { shiftKey: true })

    press(focused(), 'Escape')

    expect(highlighted()).toEqual([])
  })

  it('a plain arrow clears it and moves the caret as usual', () => {
    press(textOf(store.blocks[0]!.id), 'ArrowDown', { shiftKey: true })

    press(focused(), 'ArrowDown')

    expect(highlighted()).toEqual([])
  })

  it('typing clears it, so the highlight never outlives what it pointed at', () => {
    press(textOf(store.blocks[0]!.id), 'ArrowDown', { shiftKey: true })

    press(focused(), 'x')

    expect(highlighted()).toEqual([])
  })

  it('a click anywhere on the board clears it', () => {
    press(textOf(store.blocks[0]!.id), 'ArrowDown', { shiftKey: true })

    textOf(store.blocks[2]!.id).dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(highlighted()).toEqual([])
  })
})
