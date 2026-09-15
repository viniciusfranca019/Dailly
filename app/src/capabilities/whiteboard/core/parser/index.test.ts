import { describe, expect, it } from 'vitest'
import { parse } from '@capabilities/whiteboard'
import { serialize } from '@capabilities/whiteboard'
import { isCollapsible } from '@capabilities/whiteboard'
import type { HeadingBlock, TodoBlock } from '@capabilities/whiteboard'

describe('headings', () => {
  it('parses h1 through h4', () => {
    const blocks = parse('# One\n## Two\n### Three\n#### Four')
    expect(blocks.map((b) => b.type)).toEqual(Array(4).fill('heading'))
    expect(blocks.map((b) => (b as HeadingBlock).level)).toEqual([1, 2, 3, 4])
    expect(blocks.map((b) => b.text)).toEqual(['One', 'Two', 'Three', 'Four'])
  })

  it('falls back to a paragraph below h4 instead of clamping', () => {
    const [block] = parse('##### Five')
    expect(block?.type).toBe('paragraph')
    expect(block?.text).toBe('##### Five')
  })

  it('is a toggle section as soon as something is nested under it', () => {
    const [block] = parse('## Section\n  - detail')
    expect(block?.type).toBe('heading')
    expect(isCollapsible(block!)).toBe(true)
  })

  it('draws no toggle when there is nothing under it', () => {
    expect(isCollapsible(parse('## Section')[0]!)).toBe(false)
  })
})

describe('checkboxes', () => {
  it('parses the bare notion form, checked and unchecked', () => {
    const blocks = parse('[] todo\n[ ] spaced\n[x] done\n[X] also done')
    expect(blocks.map((b) => b.type)).toEqual(Array(4).fill('todo'))
    expect(blocks.map((b) => (b as TodoBlock).checked)).toEqual([false, false, true, true])
    expect(blocks.map((b) => b.text)).toEqual(['todo', 'spaced', 'done', 'also done'])
  })

  it('also accepts the GFM form', () => {
    const blocks = parse('- [ ] a\n* [x] b\n1. [ ] c')
    expect(blocks.map((b) => b.type)).toEqual(['todo', 'todo', 'todo'])
    expect(blocks.map((b) => (b as TodoBlock).checked)).toEqual([false, true, false])
  })

  it('does not mistake a bracketed word for a checkbox', () => {
    const [block] = parse('[link] to somewhere')
    expect(block?.type).toBe('paragraph')
  })
})

describe('lists', () => {
  it('parses bullet markers', () => {
    const blocks = parse('- a\n* b\n+ c')
    expect(blocks.map((b) => b.type)).toEqual(Array(3).fill('bulletedList'))
    expect(blocks.map((b) => b.text)).toEqual(['a', 'b', 'c'])
  })

  it('parses ordered markers and ignores the written number', () => {
    const blocks = parse('1. a\n7. b\n3) c')
    expect(blocks.map((b) => b.type)).toEqual(Array(3).fill('numberedList'))
    expect(blocks.map((b) => b.text)).toEqual(['a', 'b', 'c'])
  })

  it('has no marker of its own for toggles — any parent collapses', () => {
    const [block] = parse('- more details\n  - hidden')
    expect(block?.type).toBe('bulletedList')
    expect(isCollapsible(block!)).toBe(true)
  })
})

describe('nesting', () => {
  it('nests deeper-indented lines under the previous block', () => {
    const blocks = parse(['## Section', '  [] task', '    - detail', '# Next'].join('\n'))

    expect(blocks).toHaveLength(2)
    const section = blocks[0]!
    expect(section.type).toBe('heading')
    expect(section.children).toHaveLength(1)

    const task = section.children[0]!
    expect(task.type).toBe('todo')
    expect(task.children[0]?.type).toBe('bulletedList')
    expect(task.children[0]?.text).toBe('detail')

    expect(blocks[1]?.text).toBe('Next')
  })

  it('treats tabs as indentation', () => {
    const blocks = parse('- parent\n\t- child')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.children[0]?.text).toBe('child')
  })

  it('keeps a blank line from closing a nested section', () => {
    const blocks = parse('## Section\n  - a\n\n  - b')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.children).toHaveLength(2)
  })

  it('assigns unique ids', () => {
    const blocks = parse('# a\n  - b\n  - c')
    const ids = [blocks[0]!.id, ...blocks[0]!.children.map((c) => c.id)]
    expect(new Set(ids).size).toBe(3)
  })
})

describe('> is just text now', () => {
  it('is a paragraph, not a toggle', () => {
    for (const md of ['> texto', '>texto', '> # Title', '># Title']) {
      expect(parse(md)[0]?.type, md).toBe('paragraph')
    }
  })

  it('keeps the > in the text, so it round-trips', () => {
    expect(serialize(parse('> texto'))).toBe('> texto')
    expect(parse('> texto')[0]?.text).toBe('> texto')
  })
})
