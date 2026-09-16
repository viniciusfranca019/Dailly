// @vitest-environment jsdom
/**
 * The point of the registry: a new block type is added from the outside,
 * without editing the parser, the serializer or any existing block.
 */
import { describe, expect, it } from 'vitest'
import {
  WhiteboardDocument,
  createDefaultRegistry,
  type BlockBase,
  type BlockDefinition,
} from '@capabilities/whiteboard'
import {
  createDefaultRendererRegistry,
  el,
  mountWhiteboard,
  type BlockRenderer,
} from '@capabilities/whiteboard/dom'

// A callout: `!! text`
interface CalloutBlock extends BlockBase {
  readonly type: 'callout'
}

const calloutDefinition: BlockDefinition<CalloutBlock> = {
  type: 'callout',
  priority: 5,
  match: (line) => /^!!\s+(.*)$/.exec(line),
  parse: ({ match, children, nextId }) => ({
    type: 'callout',
    id: nextId(),
    text: match[1]!.trim(),
    children,
    collapsed: false,
  }),
  serialize: (block) => `!! ${block.text}`,
}

const calloutRenderer: BlockRenderer<CalloutBlock> = {
  type: 'callout',
  render: (block, ctx) => el(ctx.doc, 'aside', { className: 'wb-callout', text: block.text }),
}

describe('adding a block type from outside the core', () => {
  const registry = createDefaultRegistry().register(calloutDefinition)

  it('parses and serializes the new syntax', () => {
    const doc = new WhiteboardDocument('!! heads up\n- normal', { registry })
    expect(doc.blocks[0]?.type).toBe('callout')
    expect(doc.blocks[1]?.type).toBe('bulletedList')
    expect(doc.toMarkdown()).toBe('!! heads up\n- normal')
  })

  it('nests and collapses like any built-in block', () => {
    const doc = new WhiteboardDocument('!! heads up\n  [] task', { registry })
    const callout = doc.blocks[0]!
    expect(callout.children[0]?.type).toBe('todo')

    doc.toggleCheck(callout.children[0]!.id)
    expect(doc.toMarkdown()).toBe('!! heads up\n  [x] task')

    doc.toggleCollapse(callout.id)
    expect(doc.blocks[0]?.collapsed).toBe(true)
  })

  it('renders through the renderer registry', () => {
    document.body.innerHTML = '<div id="wb"></div>'
    const container = document.querySelector('#wb') as HTMLElement
    const doc = new WhiteboardDocument('!! heads up', { registry })

    mountWhiteboard(container, doc, {
      renderers: createDefaultRendererRegistry().register(calloutRenderer),
    })

    expect(container.querySelector('aside.wb-callout')?.textContent).toBe('heads up')
  })

  it('leaves the default registry untouched', () => {
    expect(new WhiteboardDocument('!! heads up').blocks[0]?.type).toBe('paragraph')
  })
})
