import { describe, expect, it } from 'vitest'
import { WhiteboardDocument, visibleBlocksInOrder } from './index.js'

/**
 * Structural edits over a selection.
 *
 * These are the model half of Shift+Arrow, Alt+Arrow, Tab and Ctrl+D. They
 * know nothing about a selection as such — they take ids, resolve them to a run
 * of adjacent siblings, and rebuild that one list. The adapter is what decides
 * which ids are selected.
 */

/**
 * ```
 * ## Manhã
 *   [] daily
 *     - sobre o deploy
 *   [x] café
 * ## Tarde
 *   - revisar PR
 * ```
 */
const SOURCE = [
  '## Manhã',
  '  [] daily',
  '    - sobre o deploy',
  '  [x] café',
  '## Tarde',
  '  - revisar PR',
].join('\n')

const ids = (doc: WhiteboardDocument) => ({
  manha: doc.blocks[0]!.id,
  daily: doc.blocks[0]!.children[0]!.id,
  deploy: doc.blocks[0]!.children[0]!.children[0]!.id,
  cafe: doc.blocks[0]!.children[1]!.id,
  tarde: doc.blocks[1]!.id,
  revisar: doc.blocks[1]!.children[0]!.id,
})

describe('visibleBlocksInOrder', () => {
  it('reads the tree the way a person does, parents before their children', () => {
    const doc = new WhiteboardDocument(SOURCE)

    expect(visibleBlocksInOrder(doc.blocks).map((block) => block.text)).toEqual([
      'Manhã',
      'daily',
      'sobre o deploy',
      'café',
      'Tarde',
      'revisar PR',
    ])
  })

  it('skips what a collapsed block is hiding', () => {
    // Shift+ArrowDown must jump over a folded subtree rather than walk into
    // blocks nobody can see.
    const doc = new WhiteboardDocument(SOURCE)
    doc.toggleCollapse(ids(doc).manha)

    expect(visibleBlocksInOrder(doc.blocks).map((block) => block.text)).toEqual([
      'Manhã',
      'Tarde',
      'revisar PR',
    ])
  })
})

describe('moving a run of blocks', () => {
  it('swaps one block with the one above it', () => {
    const doc = new WhiteboardDocument(SOURCE)

    expect(doc.moveUp(ids(doc).tarde)).toBe(true)

    expect(doc.blocks.map((block) => block.text)).toEqual(['Tarde', 'Manhã'])
  })

  it('carries the children along', () => {
    // A block is its subtree. Moving a heading that owns three blocks and
    // leaving them behind would be a different operation entirely.
    const doc = new WhiteboardDocument(SOURCE)
    doc.moveDown(ids(doc).manha)

    expect(doc.toMarkdown()).toBe(
      ['## Tarde', '  - revisar PR', '## Manhã', '  [] daily', '    - sobre o deploy', '  [x] café'].join(
        '\n',
      ),
    )
  })

  it('moves several adjacent siblings as one', () => {
    const doc = new WhiteboardDocument('- um\n- dois\n- três')
    const [um, dois] = [doc.blocks[0]!.id, doc.blocks[1]!.id]

    expect(doc.moveDown([um, dois])).toBe(true)

    expect(doc.blocks.map((block) => block.text)).toEqual(['três', 'um', 'dois'])
  })

  it('refuses at the top of its own sibling list instead of escaping the parent', () => {
    // `daily` is the first child of `Manhã`. Moving it up is a no-op, not a
    // promotion to the top level — leaving a parent is what Shift+Tab is for,
    // and a move that silently reparents is a move nobody can predict.
    const doc = new WhiteboardDocument(SOURCE)
    const before = doc.toMarkdown()

    expect(doc.moveUp(ids(doc).daily)).toBe(false)
    expect(doc.toMarkdown()).toBe(before)
  })

  it('refuses at the bottom of its own sibling list', () => {
    const doc = new WhiteboardDocument(SOURCE)
    expect(doc.moveDown(ids(doc).tarde)).toBe(false)
  })

  it('refuses roots that are not adjacent', () => {
    // A partial move — some blocks rearranged, others not — is worse than no
    // move, because it is the one outcome nobody asked for.
    const doc = new WhiteboardDocument('- um\n- dois\n- três')
    const before = doc.toMarkdown()

    expect(doc.moveDown([doc.blocks[0]!.id, doc.blocks[2]!.id])).toBe(false)
    expect(doc.toMarkdown()).toBe(before)
  })

  it('refuses roots that live under different parents', () => {
    const doc = new WhiteboardDocument(SOURCE)
    const { daily, revisar } = ids(doc)

    expect(doc.moveUp([daily, revisar])).toBe(false)
  })

  it('ignores a child whose parent is also selected', () => {
    // Selecting `Manhã` already takes `daily` along, so a selection holding both
    // is still one run of one root — not a refusal for being two blocks.
    const doc = new WhiteboardDocument(SOURCE)
    const { manha, daily, deploy } = ids(doc)

    expect(doc.moveDown([manha, daily, deploy])).toBe(true)
    expect(doc.blocks.map((block) => block.text)).toEqual(['Tarde', 'Manhã'])
  })

  it('ignores an id that is no longer in the tree', () => {
    // A selection outlives the blocks it named — a merge deletes one — and
    // editing what remains beats throwing.
    const doc = new WhiteboardDocument('- um\n- dois')

    expect(doc.moveDown([doc.blocks[0]!.id, 'fantasma'])).toBe(true)
    expect(doc.blocks.map((block) => block.text)).toEqual(['dois', 'um'])
  })

  it('does nothing when nothing is selected', () => {
    const doc = new WhiteboardDocument(SOURCE)
    expect(doc.moveUp([])).toBe(false)
  })
})

describe('indenting and outdenting a run', () => {
  it('puts the whole run under the sibling above it', () => {
    const doc = new WhiteboardDocument('- anfitrião\n- um\n- dois')
    const [um, dois] = [doc.blocks[1]!.id, doc.blocks[2]!.id]

    expect(doc.indent([um, dois])).toBe(true)

    expect(doc.toMarkdown()).toBe(['- anfitrião', '  - um', '  - dois'].join('\n'))
  })

  it('appends the run after whatever the host already had', () => {
    const doc = new WhiteboardDocument('- anfitrião\n  - antigo\n- novo')

    expect(doc.indent(doc.blocks[1]!.id)).toBe(true)

    expect(doc.toMarkdown()).toBe(['- anfitrião', '  - antigo', '  - novo'].join('\n'))
  })

  it('refuses to indent a run that starts its sibling list', () => {
    const doc = new WhiteboardDocument('- um\n- dois')
    expect(doc.indent([doc.blocks[0]!.id, doc.blocks[1]!.id])).toBe(false)
  })

  it('lifts the whole run to sit right after its old parent', () => {
    const doc = new WhiteboardDocument('- pai\n  - um\n  - dois')
    const parent = doc.blocks[0]!
    const run = [parent.children[0]!.id, parent.children[1]!.id]

    expect(doc.outdent(run)).toBe(true)

    expect(doc.toMarkdown()).toBe(['- pai', '- um', '- dois'].join('\n'))
  })

  it('leaves the children that followed the run where they were', () => {
    // The documented divergence from Notion, which drags them along. A run
    // follows the same rule the single block always has.
    const doc = new WhiteboardDocument('- pai\n  - um\n  - dois\n  - fica')
    const parent = doc.blocks[0]!

    doc.outdent([parent.children[0]!.id, parent.children[1]!.id])

    expect(doc.toMarkdown()).toBe(['- pai', '  - fica', '- um', '- dois'].join('\n'))
  })

  it('refuses to outdent a run that is already at the top level', () => {
    const doc = new WhiteboardDocument('- um\n- dois')
    expect(doc.outdent([doc.blocks[0]!.id, doc.blocks[1]!.id])).toBe(false)
  })

  it('keeps block ids stable, so a selection survives the edit', () => {
    // The adapter holds ids, not positions: if an edit minted new ones the
    // highlight would come back on the wrong blocks.
    const doc = new WhiteboardDocument('- anfitrião\n- um\n- dois')
    const before = [doc.blocks[1]!.id, doc.blocks[2]!.id]

    doc.indent(before)

    expect(doc.blocks[0]!.children.map((block) => block.id)).toEqual(before)
  })
})
