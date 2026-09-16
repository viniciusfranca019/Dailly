import { describe, expect, it, vi } from 'vitest'
import { WhiteboardDocument } from '@capabilities/whiteboard'
import type { TodoBlock } from '@capabilities/whiteboard'

const SOURCE = ['## Morning', '  [] stand up', '    - with the team', '  [x] coffee'].join('\n')

describe('WhiteboardDocument', () => {
  it('round-trips untouched markdown', () => {
    expect(new WhiteboardDocument(SOURCE).toMarkdown()).toBe(SOURCE)
  })

  it('writes a checkbox click back into the markdown at the same indent', () => {
    const doc = new WhiteboardDocument(SOURCE)
    const task = doc.blocks[0]!.children[0]!
    expect(task.text).toBe('stand up')

    doc.toggleCheck(task.id)

    expect((doc.find(task.id) as TodoBlock).checked).toBe(true)
    expect(doc.toMarkdown()).toBe(
      ['## Morning', '  [x] stand up', '    - with the team', '  [x] coffee'].join('\n'),
    )
  })

  it('unchecks on a second click', () => {
    const doc = new WhiteboardDocument('[x] done')
    doc.toggleCheck(doc.blocks[0]!.id)
    expect(doc.toMarkdown()).toBe('[] done')
  })

  it('leaves the tree untouched when checking a non-checkable block', () => {
    const doc = new WhiteboardDocument('# Title')
    const before = doc.blocks
    doc.toggleCheck(doc.blocks[0]!.id)
    expect(doc.blocks).toBe(before)
  })

  it('collapses a heading section without changing the markdown', () => {
    const doc = new WhiteboardDocument(SOURCE)
    const section = doc.blocks[0]!

    doc.toggleCollapse(section.id)

    expect(doc.find(section.id)?.collapsed).toBe(true)
    expect(doc.toMarkdown()).toBe(SOURCE)
  })

  it('treats any block with children as collapsible', () => {
    const doc = new WhiteboardDocument('- parent\n  - child')
    doc.toggleCollapse(doc.blocks[0]!.id)
    expect(doc.blocks[0]?.collapsed).toBe(true)
  })

  it('does not collapse a leaf block', () => {
    const doc = new WhiteboardDocument('- lonely')
    doc.toggleCollapse(doc.blocks[0]!.id)
    expect(doc.blocks[0]?.collapsed).toBe(false)
  })

  it('preserves the identity of untouched branches', () => {
    const doc = new WhiteboardDocument('# a\n- b\n\n# c\n- d')
    const untouched = doc.blocks[2]!
    doc.setText(doc.blocks[0]!.id, 'changed')
    expect(doc.blocks[2]).toBe(untouched)
  })

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const doc = new WhiteboardDocument('[] a')
    const listener = vi.fn()
    const unsubscribe = doc.subscribe(listener)

    doc.toggleCheck(doc.blocks[0]!.id)
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    doc.toggleCheck(doc.blocks[0]!.id)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('replaces the whole document from markdown', () => {
    const doc = new WhiteboardDocument('# old')
    doc.setMarkdown('- new')
    expect(doc.toMarkdown()).toBe('- new')
  })
})

describe('never empty', () => {
  it('starts an empty document with one paragraph to type into', () => {
    const doc = new WhiteboardDocument('')
    expect(doc.blocks).toHaveLength(1)
    expect(doc.blocks[0]?.type).toBe('paragraph')
    expect(doc.toMarkdown()).toBe('')
  })

  it('keeps a block after the last one is deleted', () => {
    const doc = new WhiteboardDocument('only')
    doc.setMarkdown('')
    expect(doc.blocks).toHaveLength(1)
  })
})

describe('collapse never outlives the children', () => {
  it('reopens a block that lost its last child', () => {
    const doc = new WhiteboardDocument('- parent\n  - only')
    doc.toggleCollapse(doc.blocks[0]!.id)
    expect(doc.blocks[0]?.collapsed).toBe(true)

    // the child is pulled out to the top level
    doc.outdent(doc.blocks[0]!.children[0]!.id)

    expect(doc.blocks[0]?.children).toHaveLength(0)
    expect(doc.blocks[0]?.collapsed).toBe(false)
  })

  it('does not swallow the next child a childless block receives', () => {
    const doc = new WhiteboardDocument('- parent\n  - only\n- other')
    doc.toggleCollapse(doc.blocks[0]!.id)
    doc.outdent(doc.blocks[0]!.children[0]!.id)

    // indent something back under it
    doc.indent(doc.blocks[1]!.id)
    expect(doc.blocks[0]?.collapsed).toBe(false)
    expect(doc.blocks[0]?.children).toHaveLength(1)
  })
})
