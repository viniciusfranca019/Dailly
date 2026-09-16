/**
 * Vanilla-DOM host for the whiteboard.
 *
 * Owns everything the individual renderers should not care about: the block
 * wrapper, the collapse arrow, children visibility, and a single delegated
 * click listener that maps `data-wb-action` onto the document store.
 */

import { isCollapsible, parse, type Block, type WhiteboardDocument } from '@dailly/whiteboard-core'
import { ACTION_ATTR, BLOCK_ID_ATTR, TEXT_ATTR, actionAttrs, type BlockAction } from './actions.js'
import { getCaretOffset, hasSelection, insertTextAtCaret, setCaret } from './caret.js'
import { el } from './dom.js'
import { createDefaultRendererRegistry } from './renderers/index.js'
import type { RendererRegistry, RenderContext } from './registry.js'

export interface MountOptions {
  readonly renderers?: RendererRegistry
  /** Swap in a real inline-markdown renderer later; default is plain text. */
  readonly renderInline?: (text: string, doc: Document) => Node
  /** Set false for a read-only board. Default: editable, like Notion. */
  readonly editable?: boolean
}

export interface WhiteboardHandle {
  /** Force a re-render (the store already re-renders on its own changes). */
  refresh(): void
  /** Put the caret in a block, `offset` characters into its text. */
  focusBlock(id: string, offset?: number): void
  /** Detach listeners and clear the container. */
  destroy(): void
}

export function mountWhiteboard(
  container: HTMLElement,
  store: WhiteboardDocument,
  options: MountOptions = {},
): WhiteboardHandle {
  const renderers = options.renderers ?? createDefaultRendererRegistry()
  const doc = container.ownerDocument
  const renderInline = options.renderInline ?? ((text: string, d: Document) => d.createTextNode(text))
  const editable = options.editable ?? true

  // While the user types we let the DOM keep the text it already shows and
  // only push it to the store; re-rendering would destroy the caret.
  let editing = false

  const render = () => {
    if (editing) return
    container.replaceChildren(...store.blocks.map((block, index) =>
      renderBlock(block, index, store.blocks),
    ))
  }

  function renderBlock(block: Block, index: number, siblings: readonly Block[]): HTMLElement {
    const ctx: RenderContext = {
      doc,
      index,
      siblings,
      renderInline: (text) => renderInline(text, doc),
      renderChildren: (target) => {
        if (target.collapsed || target.children.length === 0) return null
        return el(doc, 'div', {
          className: 'wb-children',
          children: target.children.map((child, i) => renderBlock(child, i, target.children)),
        })
      },
    }

    const renderer = renderers.get(block.type)
    if (!renderer) throw new Error(`No renderer registered for block type "${block.type}"`)

    const row = el(doc, 'div', {
      className: 'wb-row',
      children: [collapseControl(block, ctx), renderer.render(block, ctx)],
    })

    const wrapper = el(doc, 'div', {
      className: `wb-block wb-block--${block.type}${block.collapsed ? ' wb-block--collapsed' : ''}`,
      attrs: { [BLOCK_ID_ATTR]: block.id, 'data-wb-type': block.type },
      children: [row],
    })

    if (editable) {
      const text = row.querySelector<HTMLElement>(`[${TEXT_ATTR}]`)
      if (text) {
        text.setAttribute('contenteditable', CONTENTEDITABLE_VALUE)
        // Focusable on its own so the caret can be restored after a re-render;
        // -1 keeps it out of the tab order, since Tab means indent here.
        text.setAttribute('tabindex', '-1')
      }
    }

    const children = ctx.renderChildren(block)
    if (children) wrapper.appendChild(children)

    return wrapper
  }

  /** Arrow for any block with children — headings included, by that alone. */
  function collapseControl(block: Block, ctx: RenderContext): HTMLElement {
    if (!isCollapsible(block)) {
      return el(ctx.doc, 'span', { className: 'wb-arrow wb-arrow--empty' })
    }

    return el(ctx.doc, 'button', {
      className: 'wb-arrow',
      text: block.collapsed ? '▸' : '▾',
      attrs: {
        type: 'button',
        'aria-expanded': String(!block.collapsed),
        'aria-label': block.collapsed ? 'Expand' : 'Collapse',
        ...actionAttrs('collapse'),
      },
    })
  }

  const onClick = (event: Event) => {
    const target = event.target as Element | null
    const trigger = target?.closest?.(`[${ACTION_ATTR}]`)
    if (!trigger || !container.contains(trigger)) return

    const owner = trigger.closest(`[${BLOCK_ID_ATTR}]`)
    const id = owner?.getAttribute(BLOCK_ID_ATTR)
    if (!id) return

    switch (trigger.getAttribute(ACTION_ATTR) as BlockAction) {
      case 'check':
        store.toggleCheck(id)
        break
      case 'collapse':
        store.toggleCollapse(id)
        break
    }
  }

  /** The editable element of a block, ignoring the ones of its children. */
  function textOf(id: string): HTMLElement | null {
    return container.querySelector<HTMLElement>(
      `[${BLOCK_ID_ATTR}="${escapeId(id)}"] > .wb-row [${TEXT_ATTR}]`,
    )
  }

  function focusBlock(id: string, offset = 0): void {
    const text = textOf(id)
    if (!text) return
    text.focus()
    setCaret(text, offset)
  }

  /** Block id owning an editable element. */
  function blockIdOf(text: Element): string | undefined {
    return text.closest(`[${BLOCK_ID_ATTR}]`)?.getAttribute(BLOCK_ID_ATTR) ?? undefined
  }

  /** Editable elements in visual order — collapsed children are not rendered. */
  function editableAt(text: HTMLElement, step: 1 | -1): HTMLElement | undefined {
    const all = Array.from(container.querySelectorAll<HTMLElement>(`[${TEXT_ATTR}]`))
    const index = all.indexOf(text)
    return index < 0 ? undefined : all[index + step]
  }

  /**
   * Markdown shortcut: typing `# `, `- `, `[] `, `> ` … at the start of a
   * paragraph turns it into that block. The trailing space is what arms it,
   * which is also what keeps a bare `#` from converting while it is still
   * being typed. Resolution goes through the parser's own registry, so a
   * block registered from outside gets its shortcut for free.
   */
  function applyShortcut(id: string, el: HTMLElement, value: string): boolean {
    if (!store.find(id)) return false

    // What matters is the text *before the caret*: it has to be exactly a
    // marker plus its space. That way `- ` typed in front of existing text
    // converts the block and keeps the text, while a pasted `- hello ` does
    // not — and a marker typed mid-sentence is left alone.
    const prefix = value.slice(0, getCaretOffset(el))
    if (!prefix.endsWith(' ')) return false

    const [probe] = parse(prefix, { registry: store.registry })
    if (!probe || probe.type === 'paragraph' || probe.text !== '') return false

    store.transform(id, value)
    // Re-render even when the transform was a no-op (typing `- ` on something
    // that is already a bullet): the marker the user typed is still sitting in
    // the DOM and only a render from the store takes it back out.
    render()
    // The marker was everything before the caret, so what is left starts at 0.
    focusBlock(id, 0)
    return true
  }

  function commitText(text: HTMLElement): void {
    const id = blockIdOf(text)
    if (!id) return

    // A contenteditable renders the trailing space of `# ` as a non-breaking
    // space; the shortcuts key on a plain one.
    const value = (text.textContent ?? '').replace(/\u00A0/g, ' ')
    if (applyShortcut(id, text, value)) return

    editing = true
    store.setText(id, value)
    editing = false
  }

  const onInput = (event: Event) => {
    // The checkbox is an <input> and its events bubble through here too.
    const text = (event.target as Element | null)?.closest?.<HTMLElement>(`[${TEXT_ATTR}]`)
    if (text && container.contains(text)) commitText(text)
  }

  const onPaste = (event: Event) => {
    const text = (event.target as Element | null)?.closest?.<HTMLElement>(`[${TEXT_ATTR}]`)
    if (!text || !container.contains(text)) return

    event.preventDefault()
    const clipboard = (event as ClipboardEvent).clipboardData?.getData('text/plain') ?? ''
    // No soft line breaks in the model, so a multi-line paste lands on one line.
    insertTextAtCaret(text, clipboard.replace(/\s*\r?\n\s*/g, ' '))
    commitText(text)
  }

  const onKeyDown = (event: Event) => {
    const keyboard = event as KeyboardEvent
    if (keyboard.isComposing) return

    const text = (event.target as Element | null)?.closest?.<HTMLElement>(`[${TEXT_ATTR}]`)
    if (!text || !container.contains(text)) return

    const id = blockIdOf(text)
    if (!id) return

    const offset = getCaretOffset(text)
    const length = (text.textContent ?? '').length

    switch (keyboard.key) {
      case 'Enter': {
        event.preventDefault()
        // Soft line breaks are not modelled, so Shift+Enter splits as well.
        commitText(text)
        const created = store.splitBlock(id, offset)
        if (created) focusBlock(created, 0)
        return
      }

      case 'Backspace': {
        if (offset > 0 || hasSelection(text)) return
        const block = store.find(id)
        if (!block) return

        event.preventDefault()
        if (block.type !== 'paragraph') {
          store.convertToParagraph(id)
          focusBlock(id, 0)
          return
        }

        const caret = store.mergeWithPrevious(id)
        if (caret) focusBlock(caret.id, caret.offset)
        return
      }

      case 'Tab': {
        event.preventDefault()
        const moved = keyboard.shiftKey ? store.outdent(id) : store.indent(id)
        if (moved) focusBlock(id, offset)
        return
      }

      case 'ArrowUp': {
        if (offset > 0) return
        const previous = editableAt(text, -1)
        if (!previous) return
        event.preventDefault()
        previous.focus()
        setCaret(previous, (previous.textContent ?? '').length)
        return
      }

      case 'ArrowDown': {
        if (offset < length) return
        const next = editableAt(text, 1)
        if (!next) return
        event.preventDefault()
        next.focus()
        setCaret(next, 0)
        return
      }

      default:
        return
    }
  }

  container.addEventListener('click', onClick)
  if (editable) {
    container.addEventListener('keydown', onKeyDown)
    container.addEventListener('input', onInput)
    container.addEventListener('paste', onPaste)
  }

  const unsubscribe = store.subscribe(render)
  render()

  return {
    refresh: render,
    focusBlock,
    destroy: () => {
      unsubscribe()
      container.removeEventListener('click', onClick)
      container.removeEventListener('keydown', onKeyDown)
      container.removeEventListener('input', onInput)
      container.removeEventListener('paste', onPaste)
      container.replaceChildren()
    },
  }
}

/** `plaintext-only` keeps the browser from pasting markup into a block. */
const CONTENTEDITABLE_VALUE = detectContentEditableValue()

function detectContentEditableValue(): string {
  try {
    const probe = globalThis.document?.createElement('div')
    if (!probe) return 'true'
    probe.setAttribute('contenteditable', 'plaintext-only')
    return probe.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true'
  } catch {
    return 'true'
  }
}

function escapeId(id: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"')
}
