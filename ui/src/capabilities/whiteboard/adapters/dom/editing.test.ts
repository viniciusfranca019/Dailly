// @vitest-environment jsdom
/**
 * Editing goes through real events on real nodes: the handlers are delegated,
 * so everything dispatches with `bubbles: true`.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { WhiteboardDocument } from '@dailly/whiteboard-core'
import { BLOCK_ID_ATTR, TEXT_ATTR, getCaretOffset, mountWhiteboard } from '@capabilities/whiteboard/dom'
import type { WhiteboardHandle } from '@capabilities/whiteboard/dom'
import type { TodoBlock } from '@dailly/whiteboard-core'

let container: HTMLElement
let store: WhiteboardDocument
let board: WhiteboardHandle

function mount(source: string, editable = true) {
  document.body.innerHTML = '<div id="wb"></div>'
  container = document.querySelector('#wb') as HTMLElement
  store = new WhiteboardDocument(source)
  board = mountWhiteboard(container, store, { editable })
}

const textOf = (id: string) =>
  container.querySelector<HTMLElement>(`[${BLOCK_ID_ATTR}="${id}"] > .wb-row [${TEXT_ATTR}]`)!

const allText = () => Array.from(container.querySelectorAll<HTMLElement>(`[${TEXT_ATTR}]`))

/** Put the caret `offset` characters into an element, without adapter help. */
function caret(el: HTMLElement, offset: number) {
  const node = el.firstChild ?? el.appendChild(document.createTextNode(''))
  const range = document.createRange()
  range.setStart(node, Math.min(offset, node.textContent?.length ?? 0))
  range.collapse(true)
  const selection = document.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
}

/** Replace an element's text and fire the input event, as typing would. */
function type(el: HTMLElement, value: string) {
  el.textContent = value
  caret(el, value.length)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function press(el: HTMLElement, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  el.dispatchEvent(event)
  return event
}

beforeEach(() => mount('text'))

describe('typing', () => {
  it('writes into the store without re-rendering under the caret', () => {
    const id = store.blocks[0]!.id
    const before = textOf(id)

    type(before, 'hello')

    expect(store.toMarkdown()).toBe('hello')
    // Same element: a re-render here would drop the caret mid-word.
    expect(textOf(id)).toBe(before)
  })

  it('makes the text editable', () => {
    expect(textOf(store.blocks[0]!.id).getAttribute('contenteditable')).not.toBeNull()
  })

  it('leaves a read-only board alone', () => {
    mount('text', false)
    const el = textOf(store.blocks[0]!.id)
    expect(el.getAttribute('contenteditable')).toBeNull()
    type(el, 'hello')
    expect(store.toMarkdown()).toBe('text')
  })
})

describe('markdown shortcuts', () => {
  const shortcuts: [string, string, string][] = [
    ['# ', 'heading', '#'],
    ['#### ', 'heading', '####'],
    ['- ', 'bulletedList', '-'],
    ['1. ', 'numberedList', '1.'],
    ['[] ', 'todo', '[]'],
  ]

  it.each(shortcuts)('turns %s into a %s', (typed, type_, markdown) => {
    mount('')
    const doc = new WhiteboardDocument(typed.trimEnd())
    expect(doc.blocks[0]?.type).toBe(type_)

    mount('x')
    const id = store.blocks[0]!.id
    type(textOf(id), typed)

    expect(store.blocks[0]?.type).toBe(type_)
    expect(store.toMarkdown()).toBe(markdown)
    expect(textOf(id).textContent).toBe('')
  })

  it('needs the trailing space, so a bare # keeps typing', () => {
    const id = store.blocks[0]!.id
    type(textOf(id), '#')
    expect(store.blocks[0]?.type).toBe('paragraph')
    expect(store.toMarkdown()).toBe('#')
  })

  it('treats a non-breaking space as the trigger too', () => {
    const id = store.blocks[0]!.id
    type(textOf(id), '- ')
    expect(store.blocks[0]?.type).toBe('bulletedList')
  })

  it('leaves a marker typed mid-sentence alone', () => {
    mount('- item')
    const id = store.blocks[0]!.id
    type(textOf(id), '# not a heading ')
    expect(store.blocks[0]?.type).toBe('bulletedList')
    // kept verbatim: trimming as you type would eat the space between words
    expect(store.blocks[0]?.text).toBe('# not a heading ')
  })

  it('keeps the caret in the block it just converted', () => {
    const id = store.blocks[0]!.id
    type(textOf(id), '# ')
    expect(getCaretOffset(textOf(id))).toBe(0)
  })

  it('keeps children through the conversion', () => {
    mount('parent\n  - child')
    const id = store.blocks[0]!.id
    type(textOf(id), '## ')
    expect(store.blocks[0]?.type).toBe('heading')
    expect(store.blocks[0]?.children).toHaveLength(1)
  })
})

describe('Enter', () => {
  it('splits a todo into two, the new one unchecked', () => {
    mount('[x] hello world')
    const id = store.blocks[0]!.id
    const el = textOf(id)
    caret(el, 5)
    press(el, 'Enter')

    expect(store.blocks).toHaveLength(2)
    expect((store.blocks[0] as TodoBlock).checked).toBe(true)
    expect((store.blocks[1] as TodoBlock).checked).toBe(false)
    expect(store.blocks[1]?.text).toBe(' world')
  })

  it('puts the caret at the start of the new block', () => {
    mount('- hello')
    const el = textOf(store.blocks[0]!.id)
    caret(el, 5)
    press(el, 'Enter')

    expect(getCaretOffset(textOf(store.blocks[1]!.id))).toBe(0)
  })

  it('leaves the list when pressed on an empty item', () => {
    mount('- a\n- ')
    const id = store.blocks[1]!.id
    const el = textOf(id)
    caret(el, 0)
    press(el, 'Enter')

    expect(store.blocks[1]?.type).toBe('paragraph')
    expect(store.blocks).toHaveLength(2)
  })

  it('is prevented so the browser never inserts its own line break', () => {
    const el = textOf(store.blocks[0]!.id)
    caret(el, 0)
    expect(press(el, 'Enter').defaultPrevented).toBe(true)
  })
})

describe('Backspace at the start of a block', () => {
  it('drops the construct first, keeping the text', () => {
    mount('## Title')
    const id = store.blocks[0]!.id
    const el = textOf(id)
    caret(el, 0)
    press(el, 'Backspace')

    expect(store.blocks[0]?.type).toBe('paragraph')
    expect(store.blocks[0]?.text).toBe('Title')
  })

  it('merges a paragraph into the block above, carrying its children', () => {
    mount('- above\nbelow\n  - child')
    const el = textOf(store.blocks[1]!.id)
    caret(el, 0)
    press(el, 'Backspace')

    expect(store.blocks).toHaveLength(1)
    expect(store.toMarkdown()).toBe('- abovebelow\n  - child')
  })

  it('leaves the caret at the junction', () => {
    mount('- above\nbelow')
    const el = textOf(store.blocks[1]!.id)
    caret(el, 0)
    press(el, 'Backspace')

    expect(getCaretOffset(textOf(store.blocks[0]!.id))).toBe(5)
  })

  it('does nothing on the first block of the document', () => {
    mount('only')
    const el = textOf(store.blocks[0]!.id)
    caret(el, 0)
    press(el, 'Backspace')
    expect(store.toMarkdown()).toBe('only')
  })

  it('stays out of the way mid-word', () => {
    mount('- hello')
    const el = textOf(store.blocks[0]!.id)
    caret(el, 3)
    expect(press(el, 'Backspace').defaultPrevented).toBe(false)
  })
})

describe('Tab', () => {
  it('indents and outdents back to where it started', () => {
    mount('- a\n- b')
    const id = store.blocks[1]!.id

    caret(textOf(id), 0)
    press(textOf(id), 'Tab')
    expect(store.toMarkdown()).toBe('- a\n  - b')

    caret(textOf(id), 0)
    press(textOf(id), 'Tab', { shiftKey: true })
    expect(store.toMarkdown()).toBe('- a\n- b')
  })

  it('keeps the caret where it was', () => {
    mount('- a\n- hello')
    const id = store.blocks[1]!.id
    caret(textOf(id), 3)
    press(textOf(id), 'Tab')
    expect(getCaretOffset(textOf(id))).toBe(3)
  })

  it('never lets the browser move focus away', () => {
    mount('- a')
    const el = textOf(store.blocks[0]!.id)
    caret(el, 0)
    expect(press(el, 'Tab').defaultPrevented).toBe(true)
  })
})

describe('arrows', () => {
  it('walks to the block above from the start of the line', () => {
    mount('- a\n- b')
    const second = textOf(store.blocks[1]!.id)
    caret(second, 0)
    press(second, 'ArrowUp')
    expect(getCaretOffset(allText()[0]!)).toBe(1)
  })

  it('walks to the block below from the end of the line', () => {
    mount('- a\n- b')
    const first = textOf(store.blocks[0]!.id)
    caret(first, 1)
    press(first, 'ArrowDown')
    expect(getCaretOffset(allText()[1]!)).toBe(0)
  })

  it('stays inside the line when the caret is not at its edge', () => {
    mount('- hello\n- b')
    const first = textOf(store.blocks[0]!.id)
    caret(first, 2)
    expect(press(first, 'ArrowUp').defaultPrevented).toBe(false)
  })

  it('does not walk past the ends of the document', () => {
    mount('- a')
    const only = textOf(store.blocks[0]!.id)
    caret(only, 0)
    expect(press(only, 'ArrowUp').defaultPrevented).toBe(false)
  })
})

describe('checkbox next to editable text', () => {
  it('does not toggle when the text is clicked', () => {
    mount('[] task')
    const id = store.blocks[0]!.id
    textOf(id).click()
    expect((store.blocks[0] as TodoBlock).checked).toBe(false)
  })

  it('still toggles from the box itself', () => {
    mount('[] task')
    container.querySelector<HTMLInputElement>('input[type=checkbox]')!.click()
    expect((store.blocks[0] as TodoBlock).checked).toBe(true)
  })
})

describe('paste', () => {
  function paste(el: HTMLElement, text: string) {
    const event = new Event('paste', { bubbles: true, cancelable: true }) as Event & {
      clipboardData: { getData: () => string }
    }
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } })
    el.dispatchEvent(event)
    return event
  }

  it('inserts plain text at the caret and blocks the browser default', () => {
    mount('hello')
    const el = textOf(store.blocks[0]!.id)
    caret(el, 5)
    const event = paste(el, ' world')

    expect(event.defaultPrevented).toBe(true)
    expect(store.blocks[0]?.text).toBe('hello world')
  })

  it('flattens a multi-line paste onto one line', () => {
    mount('')
    const el = textOf(store.blocks[0]!.id)
    caret(el, 0)
    paste(el, 'one\ntwo')
    expect(store.blocks[0]?.text).toBe('one two')
  })
})

describe('shortcut in front of existing text', () => {
  it('converts the block and keeps the text that was already there', () => {
    mount('hello')
    const id = store.blocks[0]!.id
    const el = textOf(id)

    el.textContent = '- hello'
    caret(el, 2)
    el.dispatchEvent(new Event('input', { bubbles: true }))

    expect(store.blocks[0]?.type).toBe('bulletedList')
    expect(store.blocks[0]?.text).toBe('hello')
    expect(getCaretOffset(textOf(id))).toBe(0)
  })

  it('ignores a marker that is not immediately before the caret', () => {
    mount('')
    const el = textOf(store.blocks[0]!.id)
    el.textContent = '- hello '
    caret(el, 8)
    el.dispatchEvent(new Event('input', { bubbles: true }))

    expect(store.blocks[0]?.type).toBe('paragraph')
  })
})

describe('converting a block that already has a construct', () => {
  /** Type `marker` at the start of the first block, as the caret would. */
  function prefixWith(marker: string) {
    const id = store.blocks[0]!.id
    const el = textOf(id)
    el.textContent = `${marker}${el.textContent ?? ''}`
    caret(el, marker.length)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return id
  }

  it('turns a list item into a heading', () => {
    mount('- item')
    prefixWith('## ')
    expect(store.blocks[0]?.type).toBe('heading')
    expect(store.blocks[0]?.text).toBe('item')
    expect(store.toMarkdown()).toBe('## item')
  })

  it('turns a heading into a list item', () => {
    mount('# Title')
    prefixWith('- ')
    expect(store.blocks[0]?.type).toBe('bulletedList')
    expect(store.toMarkdown()).toBe('- Title')
  })

  it('turns a checkbox into a heading', () => {
    mount('[x] done')
    prefixWith('## ')
    expect(store.blocks[0]?.type).toBe('heading')
    expect(store.toMarkdown()).toBe('## done')
  })

  it('leaves a typed > as plain text', () => {
    mount('item')
    prefixWith('> ')
    expect(store.blocks[0]?.type).toBe('paragraph')
    expect(store.blocks[0]?.text).toBe('> item')
  })

  it('keeps children and collapsed state through the conversion', () => {
    mount('- parent\n  - child')
    store.toggleCollapse(store.blocks[0]!.id)
    prefixWith('## ')

    expect(store.blocks[0]?.type).toBe('heading')
    expect(store.blocks[0]?.children).toHaveLength(1)
    expect(store.blocks[0]?.collapsed).toBe(true)
  })

  it('swallows a marker retyped on the same construct instead of keeping it', () => {
    mount('- item')
    const id = prefixWith('- ')
    expect(store.blocks[0]?.type).toBe('bulletedList')
    expect(store.blocks[0]?.text).toBe('item')
    expect(textOf(id).textContent).toBe('item')
  })

  it('leaves the caret before the text that survived', () => {
    mount('- item')
    const id = prefixWith('## ')
    expect(getCaretOffset(textOf(id))).toBe(0)
  })
})

describe('changing a heading with a shortcut', () => {
  function prefixWith(marker: string) {
    const id = store.blocks[0]!.id
    const el = textOf(id)
    el.textContent = `${marker}${el.textContent ?? ''}`
    caret(el, marker.length)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return id
  }

  it('changes the level of a heading that already exists', () => {
    mount('# Title')
    const id = prefixWith('### ')
    expect(store.blocks[0]?.type).toBe('heading')
    expect(store.toMarkdown()).toBe('### Title')
    expect(textOf(id).textContent).toBe('Title')
    expect(container.querySelector('h3')).not.toBeNull()
  })

  it('keeps the arrow of a heading that has children', () => {
    mount('## Section\n  - child')
    prefixWith('### ')
    expect(store.toMarkdown()).toBe('### Section\n  - child')
    expect(container.querySelector('button.wb-arrow')).not.toBeNull()
  })
})
