/**
 * The mutable shell around an immutable block tree.
 *
 * Every mutation produces a new tree and notifies subscribers; adapters just
 * re-render. Nothing here touches the DOM, so the same store drives the
 * vanilla adapter today and a React/Svelte one later.
 */

import { findBlock, isCheckable, isCollapsible, mapBlock, type Block } from './blocks.js'
import {
  contiguousRun,
  lastVisibleDescendant,
  locate,
  selectionRoots,
  updateSiblingsOf,
  type SiblingRun,
} from './tree.js'
import { parse, type ParseOptions } from './parser/index.js'
import { serialize, type SerializeOptions } from './serialize.js'
import type { BlockRegistry } from './registry.js'
import { createDefaultRegistry } from './blocks/index.js'

export type DocumentListener = (blocks: readonly Block[]) => void

/** Where the caret should go after an edit that moved it. */
export interface CaretTarget {
  readonly id: string
  readonly offset: number
}

export interface DocumentOptions extends ParseOptions, SerializeOptions {
  readonly registry?: BlockRegistry
}

/**
 * Collapse only means something while there are children to hide. Without
 * this, a block that loses its last child keeps `collapsed: true` with no
 * arrow left to reopen it — and silently swallows the next child it gets.
 * Untouched branches keep their identity so renderers can still diff.
 */
function withLiveCollapse(blocks: readonly Block[]): readonly Block[] {
  let changed = false

  const next = blocks.map((block) => {
    const children = withLiveCollapse(block.children)
    const stale = block.collapsed && children.length === 0
    if (!stale && children === block.children) return block

    changed = true
    return { ...block, children, collapsed: stale ? false : block.collapsed } as Block
  })

  return changed ? next : blocks
}

/**
 * Every field but `collapsed` — which is view state the transform carries over.
 * Comparing only `type` and `text` would miss a heading changing level: same
 * type, same text, different block.
 */
function sameBlock(parsed: Block, block: Block): boolean {
  const keys = Object.keys(parsed) as (keyof Block)[]
  return keys.every((key) => key === 'collapsed' || parsed[key] === block[key])
}

export class WhiteboardDocument {
  #blocks: readonly Block[]
  #idCounter = 0
  #listeners = new Set<DocumentListener>()
  readonly #options: DocumentOptions
  readonly registry: BlockRegistry

  constructor(source = '', options: DocumentOptions = {}) {
    this.registry = options.registry ?? createDefaultRegistry()
    this.#options = { ...options, registry: this.registry }
    const parsed = parse(source, this.#parseOptions())
    this.#blocks = parsed.length > 0 ? withLiveCollapse(parsed) : [this.#emptyParagraph()]
  }

  get blocks(): readonly Block[] {
    return this.#blocks
  }

  /** Current state as markdown — what you would persist or send to the API. */
  toMarkdown(): string {
    return serialize(this.#blocks, this.#options)
  }

  /** Replace the whole document from markdown. */
  setMarkdown(source: string): void {
    this.#commit(parse(source, this.#parseOptions()))
  }

  find(id: string): Block | undefined {
    return findBlock(this.#blocks, id)
  }

  /** Flip a checkbox. No-op on blocks that have none. */
  toggleCheck(id: string): void {
    this.#update(id, (block) =>
      isCheckable(block) ? { ...block, checked: !block.checked } : block,
    )
  }

  setChecked(id: string, checked: boolean): void {
    this.#update(id, (block) => (isCheckable(block) ? { ...block, checked } : block))
  }

  /** Expand/collapse any block that has children to hide. */
  toggleCollapse(id: string): void {
    this.#update(id, (block) =>
      isCollapsible(block) ? { ...block, collapsed: !block.collapsed } : block,
    )
  }

  setCollapsed(id: string, collapsed: boolean): void {
    this.#update(id, (block) => (isCollapsible(block) ? { ...block, collapsed } : block))
  }

  /** Edit a block's inline text. */
  setText(id: string, text: string): void {
    this.#update(id, (block) => ({ ...block, text }))
  }

  subscribe(listener: DocumentListener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /**
   * Split at the caret: the text after `offset` moves into a new block and
   * its id is returned so the caller can put the caret there.
   *
   * Two behaviours borrowed from Notion: Enter on an *empty* non-paragraph
   * leaves the construct instead of repeating it, and a block with visible
   * children takes the new block as its first child, since that is the line
   * directly under the caret on screen.
   */
  splitBlock(id: string, offset: number): string | undefined {
    const block = this.find(id)
    if (!block) return undefined

    if (block.type !== 'paragraph' && block.text.length === 0) {
      this.convertToParagraph(id)
      return id
    }

    // At the very start there is nothing to move: push an empty block above and
    // leave this one intact. Splitting here would strand the block's marker
    // (a checked `[x]`, a heading level) on the empty line and demote its text.
    if (offset === 0 && block.text.length > 0) {
      const above = this.#continuationOf(block, '')
      const next = updateSiblingsOf(this.#blocks, id, (siblings, index) => {
        const rebuilt = siblings.slice()
        rebuilt.splice(index, 0, above)
        return rebuilt
      })
      if (!next) return undefined
      this.#commit(next)
      return id
    }

    const head = block.text.slice(0, offset)
    const tail = block.text.slice(offset)
    const sibling = this.#continuationOf(block, tail)

    const next = updateSiblingsOf(this.#blocks, id, (siblings, index) => {
      const current = siblings[index]!
      const rebuilt = siblings.slice()

      if (current.children.length > 0 && !current.collapsed) {
        rebuilt[index] = { ...current, text: head, children: [sibling, ...current.children] } as Block
        return rebuilt
      }

      rebuilt[index] = { ...current, text: head } as Block
      rebuilt.splice(index + 1, 0, sibling)
      return rebuilt
    })

    if (!next) return undefined
    this.#commit(next)
    return sibling.id
  }

  /**
   * Backspace at offset 0: fold this block into the one visually above it,
   * carrying its children along. Returns the junction so the caret can stay
   * where the text now joins. No-op on the very first block of the document.
   */
  mergeWithPrevious(id: string): CaretTarget | undefined {
    const location = locate(this.#blocks, id)
    if (!location) return undefined

    const block = location.siblings[location.index]!
    const previous = location.index > 0 ? location.siblings[location.index - 1] : undefined
    const target = previous ? lastVisibleDescendant(previous) : location.parent
    if (!target) return undefined

    const offset = target.text.length

    const detached = updateSiblingsOf(this.#blocks, id, (siblings, index) =>
      siblings.filter((_, i) => i !== index),
    )
    if (!detached) return undefined

    this.#commit(
      mapBlock(detached, target.id, (host) => ({
        ...host,
        text: host.text + block.text,
        children: [...host.children, ...block.children],
      })) as readonly Block[],
    )

    return { id: target.id, offset }
  }

  /** Drop a block's construct, keeping its text and children. */
  convertToParagraph(id: string): void {
    this.#update(id, (block) =>
      block.type === 'paragraph'
        ? block
        : {
            type: 'paragraph',
            id: block.id,
            text: block.text,
            children: block.children,
            collapsed: block.collapsed,
          },
    )
  }

  /**
   * Tab: become the last child of the previous sibling.
   *
   * Takes one block or a whole selection. A selection is not a special case —
   * it is a run of adjacent siblings, and one block is a run of length one, so
   * both go through the same code.
   */
  indent(target: string | readonly string[]): boolean {
    const run = this.#runOf(target)
    // Nothing above it in its own sibling list means nothing to become a child of.
    if (!run || run.from === 0) return false

    const next = updateSiblingsOf(this.#blocks, run.siblings[run.from]!.id, (siblings, index) => {
      const moved = siblings.slice(index, index + run.to - run.from + 1)
      const host = siblings[index - 1]!
      const rebuilt = siblings.slice()
      rebuilt.splice(index, moved.length)
      // Expanding the host keeps the blocks the user just moved on screen.
      rebuilt[index - 1] = {
        ...host,
        children: [...host.children, ...moved],
        collapsed: false,
      } as Block
      return rebuilt
    })

    if (!next) return false
    this.#commit(next)
    return true
  }

  /**
   * Shift+Tab (and Ctrl+D): become the next sibling of the parent. Blocks that
   * followed the run stay where they are (Notion drags them along; this does
   * not) — the same rule the single-block version has always had.
   */
  outdent(target: string | readonly string[]): boolean {
    const run = this.#runOf(target)
    if (!run?.parent) return false

    const moved = run.siblings.slice(run.from, run.to + 1)
    const movedIds = new Set(moved.map((block) => block.id))

    const next = updateSiblingsOf(this.#blocks, run.parent.id, (siblings, index) => {
      const parent = siblings[index]!
      const rebuilt = siblings.slice()
      rebuilt[index] = {
        ...parent,
        children: parent.children.filter((child) => !movedIds.has(child.id)),
      } as Block
      rebuilt.splice(index + 1, 0, ...moved)
      return rebuilt
    })

    if (!next) return false
    this.#commit(next)
    return true
  }

  /**
   * Alt+ArrowUp: swap the run with the sibling above it.
   *
   * Within the sibling list and nowhere else. At the top of its list this is a
   * no-op rather than an escape into the parent's list: moving *out* of a
   * parent is what Tab and Shift+Tab are for, and a move that silently
   * reparents is a move nobody can predict.
   */
  moveUp(target: string | readonly string[]): boolean {
    const run = this.#runOf(target)
    if (!run || run.from === 0) return false
    return this.#reorder(run, run.from - 1)
  }

  /** Alt+ArrowDown: swap the run with the sibling below it. */
  moveDown(target: string | readonly string[]): boolean {
    const run = this.#runOf(target)
    if (!run || run.to === run.siblings.length - 1) return false
    return this.#reorder(run, run.from + 1)
  }

  /** Lift the run out of its sibling list and put it back starting at `to`. */
  #reorder(run: SiblingRun, to: number): boolean {
    const next = updateSiblingsOf(this.#blocks, run.siblings[run.from]!.id, (siblings, index) => {
      const rebuilt = siblings.slice()
      const moved = rebuilt.splice(index, run.to - run.from + 1)
      rebuilt.splice(to, 0, ...moved)
      return rebuilt
    })

    if (!next) return false
    this.#commit(next)
    return true
  }

  /**
   * The run a structural edit should act on, given one id or a selection.
   *
   * Ids that are no longer in the tree are dropped rather than refused: a
   * selection can outlive the blocks it named — a merge deletes one — and an
   * edit on what remains is friendlier than an exception.
   */
  #runOf(target: string | readonly string[]): SiblingRun | undefined {
    const ids = typeof target === 'string' ? [target] : target
    const present = ids.filter((id) => locate(this.#blocks, id) !== undefined)
    return contiguousRun(this.#blocks, selectionRoots(this.#blocks, present))
  }

  /**
   * Re-read a block as if `line` had been typed, keeping its id, children and
   * collapsed state. This is the whole markdown-shortcut engine: it goes
   * through the same registry as parsing, so a block type registered from
   * outside gets its shortcut without writing a second syntax table.
   */
  transform(id: string, line: string): boolean {
    const resolved = this.registry.resolve(line)
    if (!resolved) return false

    const before = this.#blocks
    this.#update(id, (block) => {
      const parsed = resolved.definition.parse({
        line,
        match: resolved.match,
        children: block.children,
        nextId: () => block.id,
      }) as Block
      return sameBlock(parsed, block) ? block : ({ ...parsed, collapsed: block.collapsed } as Block)
    })
    return this.#blocks !== before
  }

  /** The block a split continues into: same construct, minus what should reset. */
  #continuationOf(block: Block, text: string): Block {
    const id = this.#mintId()
    // Headings do not repeat themselves; the next line is body text.
    if (block.type === 'heading') {
      return { type: 'paragraph', id, text, children: [], collapsed: false }
    }

    const continuation = { ...block, id, text, children: [], collapsed: false } as Block
    return continuation.type === 'todo' ? { ...continuation, checked: false } : continuation
  }

  #emptyParagraph(): Block {
    return { type: 'paragraph', id: this.#mintId(), text: '', children: [], collapsed: false }
  }

  #mintId(): string {
    const make = this.#options.createId ?? ((index: number) => `b${index}`)
    return make(this.#idCounter++)
  }

  /** Ids keep counting up across edits, so a rebuilt tree never reuses one. */
  #parseOptions(): DocumentOptions {
    return { ...this.#options, createId: () => this.#mintId() }
  }

  #update(id: string, update: (block: Block) => Block): void {
    const next = mapBlock(this.#blocks, id, update)
    if (next !== this.#blocks) this.#commit(next)
  }

  #commit(blocks: readonly Block[]): void {
    // A document is never truly empty: there is always one block to put the
    // caret in, otherwise an empty board could never be typed into.
    this.#blocks = blocks.length > 0 ? withLiveCollapse(blocks) : [this.#emptyParagraph()]
    for (const listener of this.#listeners) listener(this.#blocks)
  }
}
