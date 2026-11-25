// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WhiteboardDocument } from '@dailly/whiteboard-core'
import { mountWhiteboard } from '@capabilities/whiteboard/dom'

const SOURCE = [
  '# Daily',
  '## Morning',
  '  [] stand up',
  '    - with the team',
  '  [x] coffee',
  '- details',
  '  1. first',
  '  2. second',
].join('\n')

let container: HTMLElement
let store: WhiteboardDocument

beforeEach(() => {
  document.body.innerHTML = '<div id="wb"></div>'
  container = document.querySelector('#wb') as HTMLElement
  store = new WhiteboardDocument(SOURCE)
  mountWhiteboard(container, store)
})

const query = <T extends Element>(selector: string) => container.querySelector(selector) as T | null
const queryAll = (selector: string) => Array.from(container.querySelectorAll(selector))

describe('rendering', () => {
  it('renders headings as h1..h4 elements', () => {
    expect(query('h1')?.textContent).toBe('Daily')
    expect(query('h2')?.textContent).toBe('Morning')
  })

  it('renders checkboxes with their checked state', () => {
    const boxes = queryAll('input[type=checkbox]') as HTMLInputElement[]
    expect(boxes).toHaveLength(2)
    expect(boxes.map((b) => b.checked)).toEqual([false, true])
  })

  it('renders bullet and numbered markers', () => {
    expect(queryAll('.wb-list--bulleted .wb-marker').map((n) => n.textContent)).toEqual(['•', '•'])
    expect(queryAll('.wb-list--numbered .wb-marker').map((n) => n.textContent)).toEqual(['1.', '2.'])
  })

  it('nests children inside the parent block element', () => {
    const section = queryAll('.wb-block--heading').at(1)!
    expect(section.querySelectorAll(':scope > .wb-children > .wb-block')).toHaveLength(2)
    // the bullet nested under the first todo stays one level deeper
    expect(section.querySelectorAll('.wb-block')).toHaveLength(3)
  })

  it('draws a collapse arrow only on collapsible blocks', () => {
    const arrowTypes = queryAll('.wb-block')
      .filter((b) => b.querySelector(':scope > .wb-row > button.wb-arrow'))
      .map((b) => b.getAttribute('data-wb-type'))
    // the h2 section, the bullet holding the numbered list, and the todo that
    // has a nested bullet — an arrow means "has children", nothing else
    expect(new Set(arrowTypes)).toEqual(new Set(['heading', 'bulletedList', 'todo']))
    // a plain h1 with no children gets none
    expect(queryAll('.wb-block--heading')[0]?.querySelector('button.wb-arrow')).toBeNull()
  })
})

describe('interaction', () => {
  it('writes a checkbox click back into the markdown at the same indent', () => {
    const box = query<HTMLInputElement>('input[type=checkbox]')!
    box.click()

    expect(store.toMarkdown()).toBe(
      [
        '# Daily',
        '## Morning',
        '  [x] stand up',
        '    - with the team',
        '  [x] coffee',
        '- details',
        '  1. first',
        '  2. second',
      ].join('\n'),
    )
  })

  it('re-renders the checkbox after the click', () => {
    query<HTMLInputElement>('input[type=checkbox]')!.click()
    const box = query<HTMLInputElement>('input[type=checkbox]')!
    expect(box.checked).toBe(true)
    expect(box.closest('.wb-todo')?.classList.contains('wb-todo--checked')).toBe(true)
  })

  it('hides children when a heading section is collapsed, and restores them', () => {
    const section = queryAll('.wb-block--heading').at(1) as HTMLElement
    const arrow = section.querySelector(':scope > .wb-row > button.wb-arrow') as HTMLButtonElement

    expect(arrow.getAttribute('aria-expanded')).toBe('true')
    arrow.click()

    const collapsed = queryAll('.wb-block--heading').at(1) as HTMLElement
    expect(collapsed.querySelector('.wb-children')).toBeNull()
    expect(collapsed.querySelector('button.wb-arrow')?.getAttribute('aria-expanded')).toBe('false')
    expect(store.toMarkdown()).toBe(SOURCE)

    ;(collapsed.querySelector('button.wb-arrow') as HTMLButtonElement).click()
    expect((queryAll('.wb-block--heading').at(1) as HTMLElement).querySelector('.wb-children'))
      .not.toBeNull()
  })

  it('collapses a list item independently', () => {
    const withArrow = () =>
      queryAll('.wb-block--bulletedList').find((b) =>
        b.querySelector(':scope > .wb-row > button.wb-arrow'),
      ) as HTMLElement

    const id = withArrow().getAttribute('data-wb-id')
    ;(withArrow().querySelector('button.wb-arrow') as HTMLButtonElement).click()

    // the click re-renders, so the node captured above is detached by now
    const collapsed = container.querySelector(`[data-wb-id="${id}"]`) as HTMLElement
    expect(collapsed.querySelector('.wb-children')).toBeNull()
  })

  it('stops responding after destroy', () => {
    const handle = mountWhiteboard(container, store)
    handle.destroy()
    expect(container.children).toHaveLength(0)
  })
})

describe('inline markdown (LAB-5)', () => {
  const mountOn = (source: string, options: { editable?: boolean } = {}) => {
    document.body.innerHTML = '<div id="inline"></div>'
    const host = document.querySelector('#inline') as HTMLElement
    const doc = new WhiteboardDocument(source)
    mountWhiteboard(host, doc, options)
    const texts = () => Array.from(host.querySelectorAll<HTMLElement>('[data-wb-text]'))
    return { host, doc, texts }
  }

  it('C1: inline code shows in a code element, without the backticks', () => {
    const { host } = mountOn('rode `make dev` antes')
    expect(host.querySelector('code.wb-code')?.textContent).toBe('make dev')
    expect(host.textContent).toBe('rode make dev antes')
  })

  it('C2: bold shows in a strong element, without the stars, on a read-only board', () => {
    const { host } = mountOn('**Jornal** é o nome novo', { editable: false })
    expect(host.querySelector('strong')?.textContent).toBe('Jornal')
    expect(host.textContent).toBe('Jornal é o nome novo')
  })

  it('C3: italic shows in an em element and a safe link is a link that opens in a new tab', () => {
    const { host } = mountOn('*rascunho* e [docs](https://example.com)', { editable: false })
    expect(host.querySelector('em')?.textContent).toBe('rascunho')
    const link = host.querySelector<HTMLAnchorElement>('a.wb-link')!
    expect(link.textContent).toBe('docs')
    expect(link.getAttribute('href')).toBe('https://example.com')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(host.textContent).toBe('rascunho e docs')
  })

  it('C4: the block with the caret shows its markers, and turns formatted again when the caret leaves', () => {
    const { host, texts } = mountOn('**Jornal** é o nome novo\noutro bloco')
    const [first, second] = texts()

    first!.focus()
    expect(first!.textContent).toBe('**Jornal** é o nome novo')
    expect(first!.querySelector('strong')).toBeNull()

    second!.focus()
    expect(host.querySelector('strong')?.textContent).toBe('Jornal')
    expect(texts()[0]!.textContent).toBe('Jornal é o nome novo')
  })

  it('C4: a click on formatted text puts the caret on the same character in the raw text', async () => {
    const { texts } = mountOn('a **bold** c')
    const [text] = texts()
    const boldText = text!.querySelector('strong')!.firstChild as Text
    const range = document.createRange()
    range.setStart(boldText, 2) // between "bo" and "ld"
    range.collapse(true)
    document.getSelection()!.removeAllRanges()
    document.getSelection()!.addRange(range)

    text!.focus()
    // The browser finishes placing a click's caret after the focus events.
    await new Promise((resolve) => setTimeout(resolve, 0))

    const selection = document.getSelection()!.getRangeAt(0)
    const probe = document.createRange()
    probe.selectNodeContents(text!)
    probe.setEnd(selection.startContainer, selection.startOffset)
    expect(probe.toString()).toBe('a **bo')
  })

  it('a window that loses the focus keeps the caret where it was', () => {
    const { texts } = mountOn('hello world')
    const text = texts()[0]!
    text.focus()
    const range = document.createRange()
    range.setStart(text.firstChild!, 5)
    range.collapse(true)
    document.getSelection()!.removeAllRanges()
    document.getSelection()!.addRange(range)

    // The window blurs: focusout fires, but the block is still the active element.
    text.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    text.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))

    const selection = document.getSelection()!.getRangeAt(0)
    expect(selection.startContainer.textContent).toBe('hello world')
    expect(selection.startOffset).toBe(5)
  })

  it('C4: a click is carried to the raw text even when the browser focuses before placing the caret', async () => {
    const { texts } = mountOn('a **bold** c')
    const text = texts()[0]!
    const boldText = text.querySelector('strong')!.firstChild as Text
    // Chromium focuses on mousedown and only then places the caret; the point
    // under the mouse is what tells where the click was.
    const atPoint = document.createRange()
    atPoint.setStart(boldText, 2)
    const original = (document as { caretRangeFromPoint?: unknown }).caretRangeFromPoint
    ;(document as unknown as { caretRangeFromPoint: () => Range }).caretRangeFromPoint = () => atPoint
    document.getSelection()!.removeAllRanges()

    boldText.parentElement!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }))
    text.focus()
    await new Promise((resolve) => setTimeout(resolve, 0))
    ;(document as { caretRangeFromPoint?: unknown }).caretRangeFromPoint = original

    const selection = document.getSelection()!.getRangeAt(0)
    const probe = document.createRange()
    probe.selectNodeContents(text)
    probe.setEnd(selection.startContainer, selection.startOffset)
    expect(probe.toString()).toBe('a **bo')
  })

  it('C5: editing another block keeps the markers in the markdown', () => {
    const { doc, texts } = mountOn('**a** e `b`\noutro')
    const second = texts()[1]!
    second.focus()
    second.textContent = 'outro editado'
    second.dispatchEvent(new Event('input', { bubbles: true }))
    second.blur()

    expect(doc.toMarkdown()).toBe('**a** e `b`\noutro editado')
  })

  it('C5: typing in a formatted block saves the raw text with its markers', () => {
    const { doc, texts } = mountOn('**a** e `b`')
    const first = texts()[0]!
    first.focus()
    first.textContent = `${first.textContent} c`
    first.dispatchEvent(new Event('input', { bubbles: true }))

    expect(doc.toMarkdown()).toBe('**a** e `b` c')
  })

  it('C6: an unpaired marker or an unsafe link is shown as written', () => {
    const raw = '2 ** 3, `aberto e [x](javascript:alert(1))'
    const { host } = mountOn(raw, { editable: false })
    expect(host.querySelector('strong, code, a')).toBeNull()
    expect(host.textContent).toBe(raw)
  })

  it('Ctrl+click on a link of an editable block opens it in a new tab instead of editing', () => {
    const { host } = mountOn('[docs](https://example.com)')
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const link = host.querySelector<HTMLAnchorElement>('a.wb-link')!

    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, ctrlKey: true })
    link.dispatchEvent(event)

    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
    expect(event.defaultPrevented).toBe(true)
    open.mockRestore()
  })
})
