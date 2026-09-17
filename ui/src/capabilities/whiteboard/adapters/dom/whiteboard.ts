/**
 * Vanilla-DOM host for the whiteboard.
 *
 * Owns everything the individual renderers should not care about: the block
 * wrapper, the collapse arrow, children visibility, and a single delegated
 * click listener that maps `data-wb-action` onto the document store.
 */

import {
  isCollapsible,
  parse,
  visibleBlocksInOrder,
  walk,
  type Block,
  type WhiteboardDocument,
} from '@dailly/whiteboard-core'
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

  /**
   * Block selection, as two ids and nothing else.
   *
   * Which blocks that means is *derived*, never stored: the range is everything
   * visible between the two, in document order. Storing the resolved set would
   * mean keeping it in step with every edit; deriving it means an edit can
   * never leave a stale list behind. Ids survive edits — `updateSiblingsOf`
   * rebuilds lists without minting new ones — so the selection follows the
   * blocks when they move.
   */
  let selection: { anchor: string; head: string } | undefined

  /** Every block currently selected, subtrees included. */
  function selectedIds(): string[] {
    if (!selection) return []
    const visible = visibleBlocksInOrder(store.blocks)
    const anchor = visible.findIndex((block) => block.id === selection!.anchor)
    const head = visible.findIndex((block) => block.id === selection!.head)
    // A block named by the selection can be gone — merged away, for instance.
    if (anchor < 0 || head < 0) return []

    const [from, to] = anchor <= head ? [anchor, head] : [head, anchor]
    const ids: string[] = []
    for (const block of visible.slice(from, to + 1)) {
      // Subtrees come along: selecting a parent selects what it holds, whether
      // or not the children are on screen.
      for (const inside of walk([block])) ids.push(inside.id)
    }
    return ids
  }

  /**
   * Re-apply the highlight to the blocks it belongs to.
   *
   * Called after every render rather than when the selection changes: `render`
   * rebuilds the DOM from the store, so a class set by a key handler would be
   * thrown away by the next edit — and after Alt+ArrowDown the highlight would
   * stay on the positions the blocks just left.
   */
  function paintSelection(): void {
    const selected = new Set(selectedIds())
    for (const node of container.querySelectorAll<HTMLElement>(`[${BLOCK_ID_ATTR}]`)) {
      node.classList.toggle('wb-block--selected', selected.has(node.getAttribute(BLOCK_ID_ATTR)!))
    }
  }

  function clearSelection(): void {
    if (!selection) return
    selection = undefined
    paintSelection()
  }

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
    if (!target || !container.contains(target)) return

    // Any click on the board is a new place to work from, and whatever was
    // selected is not it. Above the action check on purpose: most clicks land
    // on text, which has no action and would otherwise leave the highlight up.
    clearSelection()

    const trigger = target.closest?.(`[${ACTION_ATTR}]`)
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

  /** Whether the browser's text selection already covers this block's text. */
  function selectionSpans(text: HTMLElement): boolean {
    const domSelection = text.ownerDocument.getSelection()
    if (!domSelection || domSelection.rangeCount === 0) return false
    const range = domSelection.getRangeAt(0)
    if (!text.contains(range.startContainer)) return false
    return range.toString().length >= (text.textContent ?? '').length
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
    /** What a structural edit acts on: the selection, or the block you are in. */
    const targets = () => (selection ? selectedIds() : [id])
    /** Every structural edit re-renders, so the caret has to be put back. */
    const restore = () => focusBlock(id, Math.min(offset, length))

    // Shift+Arrow: grow or shrink the block selection.
    if (keyboard.shiftKey && (keyboard.key === 'ArrowUp' || keyboard.key === 'ArrowDown')) {
      // Deliberately before the caret-position checks the plain arrows make:
      // block selection does not care where in the text the caret sits.
      event.preventDefault()
      const visible = visibleBlocksInOrder(store.blocks)
      const current = selection ?? { anchor: id, head: id }
      const at = visible.findIndex((block) => block.id === current.head)
      const next = visible[at + (keyboard.key === 'ArrowDown' ? 1 : -1)]
      if (!next) return

      selection = { anchor: current.anchor, head: next.id }
      paintSelection()
      // Focus follows the head so the next keystroke still arrives here.
      focusBlock(next.id, 0)
      return
    }

    // Alt+Arrow: move blocks, the way every editor moves lines.
    if (keyboard.altKey && (keyboard.key === 'ArrowUp' || keyboard.key === 'ArrowDown')) {
      event.preventDefault()
      const moved =
        keyboard.key === 'ArrowUp' ? store.moveUp(targets()) : store.moveDown(targets())
      if (moved) restore()
      return
    }

    // Ctrl+D: outdent, as in vim's insert mode. Shift+Tab does the same thing;
    // this is the spelling someone arriving from an editor reaches for first.
    if (keyboard.ctrlKey && !keyboard.metaKey && (keyboard.key === 'd' || keyboard.key === 'D')) {
      // Before anything else: in a browser this key is "bookmark this page".
      event.preventDefault()
      if (store.outdent(targets())) restore()
      return
    }

    // Ctrl+A: the block's text first, then the whole board.
    if ((keyboard.ctrlKey || keyboard.metaKey) && (keyboard.key === 'a' || keyboard.key === 'A')) {
      const wholeTextTaken = length === 0 || selectionSpans(text)
      // First press in a block with unselected text belongs to the browser:
      // selecting the text you are editing must keep working.
      if (!selection && !wholeTextTaken) return

      event.preventDefault()
      const visible = visibleBlocksInOrder(store.blocks)
      const last = visible[visible.length - 1]
      if (!visible[0] || !last) return
      selection = { anchor: visible[0].id, head: last.id }
      paintSelection()
      return
    }

    // Backspace or Delete on a block selection removes it. Above the ordinary
    // Backspace on purpose: without a selection that key merges this block into
    // the one before it, which is a different act on a different target.
    if (selection && (keyboard.key === 'Backspace' || keyboard.key === 'Delete')) {
      event.preventDefault()
      const caret = store.remove(selectedIds())
      selection = undefined
      if (caret) focusBlock(caret.id, caret.offset)
      return
    }

    if (keyboard.key === 'Escape') {
      clearSelection()
      return
    }

    if (keyboard.key === 'Tab') {
      event.preventDefault()
      const moved = keyboard.shiftKey ? store.outdent(targets()) : store.indent(targets())
      if (moved) restore()
      return
    }

    // Everything below is ordinary text editing, and ordinary text editing
    // happens with no block selection: typing into a selection would leave the
    // highlight sitting over blocks the person is no longer acting on.
    clearSelection()

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

  const draw = () => {
    render()
    paintSelection()
  }

  const unsubscribe = store.subscribe(draw)
  draw()

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
