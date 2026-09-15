import type {
  BulletedListBlock,
  HeadingBlock,
  NumberedListBlock,
  ParagraphBlock,
  TodoBlock,
} from '../../../core/index.js'
import { ordinalOf } from '../../../core/index.js'
import { TEXT_ATTR, actionAttrs } from '../actions.js'
import { el } from '../dom.js'
import { RendererRegistry, type BlockRenderer, type RenderContext } from '../registry.js'

/**
 * The block's inline content. Tagged with `data-wb-text`: the host turns it
 * into the editable surface, so renderers stay unaware that editing exists.
 */
function textSpan(block: { text: string }, ctx: RenderContext): HTMLElement {
  return el(ctx.doc, 'span', {
    className: 'wb-text',
    attrs: { [TEXT_ATTR]: '' },
    children: [ctx.renderInline(block.text)],
  })
}

/** Bullet, number or checkbox column in front of the text. */
function marker(ctx: RenderContext, children: readonly Node[]): HTMLElement {
  return el(ctx.doc, 'span', { className: 'wb-marker', attrs: { 'aria-hidden': 'true' }, children })
}

export const headingRenderer: BlockRenderer<HeadingBlock> = {
  type: 'heading',
  render: (block, ctx) =>
    el(ctx.doc, `h${block.level}` as 'h1', {
      className: `wb-heading wb-heading--${block.level}`,
      children: [textSpan(block, ctx)],
    }),
}

export const todoRenderer: BlockRenderer<TodoBlock> = {
  type: 'todo',
  render: (block, ctx) => {
    const box = el(ctx.doc, 'input', {
      className: 'wb-checkbox',
      attrs: { type: 'checkbox', ...actionAttrs('check') },
    })
    box.checked = block.checked

    // Deliberately not a <label>: the text is editable, and clicking it to
    // place the caret would otherwise toggle the checkbox.
    return el(ctx.doc, 'div', {
      className: `wb-todo${block.checked ? ' wb-todo--checked' : ''}`,
      children: [box, textSpan(block, ctx)],
    })
  },
}

export const bulletedListRenderer: BlockRenderer<BulletedListBlock> = {
  type: 'bulletedList',
  render: (block, ctx) =>
    el(ctx.doc, 'div', {
      className: 'wb-list wb-list--bulleted',
      children: [marker(ctx, [ctx.doc.createTextNode('•')]), textSpan(block, ctx)],
    }),
}

export const numberedListRenderer: BlockRenderer<NumberedListBlock> = {
  type: 'numberedList',
  render: (block, ctx) =>
    el(ctx.doc, 'div', {
      className: 'wb-list wb-list--numbered',
      children: [
        marker(ctx, [ctx.doc.createTextNode(`${ordinalOf(ctx.index, ctx.siblings)}.`)]),
        textSpan(block, ctx),
      ],
    }),
}

export const paragraphRenderer: BlockRenderer<ParagraphBlock> = {
  type: 'paragraph',
  render: (block, ctx) =>
    el(ctx.doc, 'p', { className: 'wb-paragraph', children: [textSpan(block, ctx)] }),
}

/** Renderers matching the block set from `createDefaultRegistry()`. */
export function createDefaultRendererRegistry(): RendererRegistry {
  return new RendererRegistry()
    .register(headingRenderer)
    .register(todoRenderer)
    .register(bulletedListRenderer)
    .register(numberedListRenderer)
    .register(paragraphRenderer)
}
