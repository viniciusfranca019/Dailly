// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
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
