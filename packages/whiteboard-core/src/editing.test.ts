import { describe, expect, it } from 'vitest'
import { WhiteboardDocument } from './index.js'
import type { HeadingBlock, TodoBlock } from './index.js'

describe('splitBlock', () => {
  it('moves the text after the caret into a new sibling', () => {
    const doc = new WhiteboardDocument('- hello world')
    const newId = doc.splitBlock(doc.blocks[0]!.id, 5)

    expect(doc.toMarkdown()).toBe('- hello\n-  world')
    expect(doc.blocks[1]?.id).toBe(newId)
    expect(doc.blocks[1]?.type).toBe('bulletedList')
  })

  it('continues a todo unchecked', () => {
    const doc = new WhiteboardDocument('[x] done')
    doc.splitBlock(doc.blocks[0]!.id, 4)
    expect((doc.blocks[0] as TodoBlock).checked).toBe(true)
    expect((doc.blocks[1] as TodoBlock).checked).toBe(false)
  })

  it('continues a heading as a paragraph', () => {
    const doc = new WhiteboardDocument('## Title')
    doc.splitBlock(doc.blocks[0]!.id, 3)
    expect(doc.blocks[1]?.type).toBe('paragraph')
    expect(doc.toMarkdown()).toBe('## Tit\nle')
  })

  it('leaves the construct when splitting an empty one, instead of repeating it', () => {
    const doc = new WhiteboardDocument('- a\n- ')
    const empty = doc.blocks[1]!
    const focus = doc.splitBlock(empty.id, 0)

    expect(focus).toBe(empty.id)
    expect(doc.blocks).toHaveLength(2)
    expect(doc.blocks[1]?.type).toBe('paragraph')
  })

  it('puts the new block first among visible children, where the caret line is', () => {
    const doc = new WhiteboardDocument('- parent\n  - child')
    doc.splitBlock(doc.blocks[0]!.id, 6)

    // an empty bullet serializes as the bare marker
    expect(doc.toMarkdown()).toBe('- parent\n  -\n  - child')
    expect(doc.blocks[0]?.children).toHaveLength(2)
  })

  it('falls back to a sibling when the children are hidden', () => {
    const doc = new WhiteboardDocument('- parent\n  - child')
    doc.toggleCollapse(doc.blocks[0]!.id)
    doc.splitBlock(doc.blocks[0]!.id, 6)
    expect(doc.blocks).toHaveLength(2)
  })

  it('mints ids that never collide with parsed ones', () => {
    const doc = new WhiteboardDocument('- a\n- b')
    doc.splitBlock(doc.blocks[0]!.id, 1)
    doc.splitBlock(doc.blocks[0]!.id, 0)
    const ids = [...(function* walk(bs): Generator<string> {
      for (const b of bs) { yield b.id; yield* walk(b.children) }
    })(doc.blocks)]
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('mergeWithPrevious', () => {
  it('folds a block into the previous one and reports the junction', () => {
    const doc = new WhiteboardDocument('- hello\n- world')
    const caret = doc.mergeWithPrevious(doc.blocks[1]!.id)

    expect(caret).toEqual({ id: doc.blocks[0]!.id, offset: 5 })
    expect(doc.toMarkdown()).toBe('- helloworld')
  })

  it('undoes a split exactly, caret included', () => {
    const doc = new WhiteboardDocument('- hello world')
    const id = doc.blocks[0]!.id

    const created = doc.splitBlock(id, 5)!
    const caret = doc.mergeWithPrevious(created)

    expect(caret).toEqual({ id, offset: 5 })
    expect(doc.blocks).toHaveLength(1)
    expect(doc.blocks[0]?.text).toBe('hello world')
  })

  it('carries the merged block children over', () => {
    const doc = new WhiteboardDocument('- a\n- b\n  - child')
    doc.mergeWithPrevious(doc.blocks[1]!.id)

    expect(doc.blocks).toHaveLength(1)
    expect(doc.toMarkdown()).toBe('- ab\n  - child')
  })

  it('merges into the block visually above, not the sibling above', () => {
    const doc = new WhiteboardDocument('- a\n  - deep\n- b')
    doc.mergeWithPrevious(doc.blocks[1]!.id)
    expect(doc.toMarkdown()).toBe('- a\n  - deepb')
  })

  it('merges into the parent when it is the first child', () => {
    const doc = new WhiteboardDocument('- parent\n  - first')
    doc.mergeWithPrevious(doc.blocks[0]!.children[0]!.id)
    expect(doc.toMarkdown()).toBe('- parentfirst')
  })

  it('does nothing on the very first block', () => {
    const doc = new WhiteboardDocument('- only')
    expect(doc.mergeWithPrevious(doc.blocks[0]!.id)).toBeUndefined()
    expect(doc.toMarkdown()).toBe('- only')
  })

  it('ignores hidden children when picking the target', () => {
    const doc = new WhiteboardDocument('- a\n  - deep\n- b')
    doc.toggleCollapse(doc.blocks[0]!.id)
    doc.mergeWithPrevious(doc.blocks[1]!.id)
    expect(doc.blocks[0]?.text).toBe('ab')
  })
})

describe('indent / outdent', () => {
  it('indents under the previous sibling', () => {
    const doc = new WhiteboardDocument('- a\n- b')
    expect(doc.indent(doc.blocks[1]!.id)).toBe(true)
    expect(doc.toMarkdown()).toBe('- a\n  - b')
  })

  it('refuses to indent the first block of a level', () => {
    const doc = new WhiteboardDocument('- a\n- b')
    expect(doc.indent(doc.blocks[0]!.id)).toBe(false)
  })

  it('expands the host so the moved block stays visible', () => {
    const doc = new WhiteboardDocument('- a\n  - deep\n- b')
    doc.toggleCollapse(doc.blocks[0]!.id)
    doc.indent(doc.blocks[1]!.id)
    expect(doc.blocks[0]?.collapsed).toBe(false)
  })

  it('outdents back to the parent level', () => {
    const doc = new WhiteboardDocument('- a\n  - b')
    expect(doc.outdent(doc.blocks[0]!.children[0]!.id)).toBe(true)
    expect(doc.toMarkdown()).toBe('- a\n- b')
  })

  it('refuses to outdent a top-level block', () => {
    const doc = new WhiteboardDocument('- a')
    expect(doc.outdent(doc.blocks[0]!.id)).toBe(false)
  })

  it('is an identity round-trip', () => {
    const doc = new WhiteboardDocument('- a\n- b\n- c')
    const id = doc.blocks[1]!.id
    doc.indent(id)
    doc.outdent(id)
    expect(doc.toMarkdown()).toBe('- a\n- b\n- c')
  })

  it('keeps the indented block children', () => {
    const doc = new WhiteboardDocument('- a\n- b\n  - child')
    doc.indent(doc.blocks[1]!.id)
    expect(doc.toMarkdown()).toBe('- a\n  - b\n    - child')
  })
})

describe('transform', () => {
  it('turns a paragraph into a heading, keeping id and children', () => {
    const doc = new WhiteboardDocument('text\n  - child')
    const id = doc.blocks[0]!.id

    expect(doc.transform(id, '# Title')).toBe(true)

    const block = doc.blocks[0] as HeadingBlock
    expect(block.type).toBe('heading')
    expect(block.id).toBe(id)
    expect(block.level).toBe(1)
    expect(block.children).toHaveLength(1)
    expect(doc.toMarkdown()).toBe('# Title\n  - child')
  })

  it('handles every built-in construct', () => {
    const cases: [string, string][] = [
      ['# ', 'heading'],
      ['#### ', 'heading'],
      ['- ', 'bulletedList'],
      ['1. ', 'numberedList'],
      ['[] ', 'todo'],
    ]
    for (const [line, type] of cases) {
      const doc = new WhiteboardDocument('text')
      doc.transform(doc.blocks[0]!.id, line)
      expect(doc.blocks[0]?.type, line).toBe(type)
    }
  })

  it('keeps the collapsed state', () => {
    const doc = new WhiteboardDocument('text\n  - child')
    doc.toggleCollapse(doc.blocks[0]!.id)
    doc.transform(doc.blocks[0]!.id, '## Section')
    expect(doc.blocks[0]?.collapsed).toBe(true)
  })

  it('reports no change when the line means the same block', () => {
    const doc = new WhiteboardDocument('# Title')
    expect(doc.transform(doc.blocks[0]!.id, '# Title')).toBe(false)
  })
})

describe('splitBlock at the very start', () => {
  it('pushes an empty block above and keeps the text where it is', () => {
    const doc = new WhiteboardDocument('- a\n  - child')
    const id = doc.blocks[0]!.id

    expect(doc.splitBlock(id, 0)).toBe(id)
    expect(doc.toMarkdown()).toBe('-\n- a\n  - child')
    expect(doc.blocks[1]?.id).toBe(id)
  })

  it('does not strand a checkmark on the empty line', () => {
    const doc = new WhiteboardDocument('[x] done')
    doc.splitBlock(doc.blocks[0]!.id, 0)

    expect(doc.toMarkdown()).toBe('[]\n[x] done')
    expect((doc.blocks[1] as TodoBlock).checked).toBe(true)
  })

  it('does not strip a heading of its text', () => {
    const doc = new WhiteboardDocument('## Title')
    doc.splitBlock(doc.blocks[0]!.id, 0)
    expect(doc.toMarkdown()).toBe('\n## Title')
  })
})

describe('transform within the same block type', () => {
  it('changes the heading level', () => {
    const doc = new WhiteboardDocument('# Title')
    expect(doc.transform(doc.blocks[0]!.id, '## Title')).toBe(true)
    expect((doc.blocks[0] as HeadingBlock).level).toBe(2)
    expect(doc.toMarkdown()).toBe('## Title')
  })

  it('keeps the children a heading collapses when its level changes', () => {
    const doc = new WhiteboardDocument('# Title\n  - child')
    expect(doc.transform(doc.blocks[0]!.id, '### Title')).toBe(true)
    expect((doc.blocks[0] as HeadingBlock).level).toBe(3)
    expect(doc.toMarkdown()).toBe('### Title\n  - child')
  })

  it('unchecks a checkbox retyped as an empty one', () => {
    const doc = new WhiteboardDocument('[x] done')
    expect(doc.transform(doc.blocks[0]!.id, '[] done')).toBe(true)
    expect(doc.toMarkdown()).toBe('[] done')
  })
})
