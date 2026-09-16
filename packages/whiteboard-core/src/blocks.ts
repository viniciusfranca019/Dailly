/**
 * The block model.
 *
 * A document is a tree of blocks, Notion-style: there is no "list" container
 * node, every list item is a block of its own and nesting is expressed by
 * `children`. Numbering of ordered lists is derived at render/serialize time
 * from the position among siblings, never stored.
 *
 * Adding a new kind of block means adding a variant here plus one
 * `BlockDefinition` (see ./registry.ts). Nothing else in the pipeline needs
 * to know about it.
 */

/** Heading levels we support. `#####` and deeper fall back to a paragraph. */
export type HeadingLevel = 1 | 2 | 3 | 4

/** Fields shared by every block. */
export interface BlockBase {
  /** Stable within a document instance; used by renderers as `data-block-id`. */
  readonly id: string
  /** Inline text of the block, without its markdown marker. */
  readonly text: string
  readonly children: readonly Block[]
  /** View state: whether children are hidden. Not part of the markdown. */
  readonly collapsed: boolean
}

export interface HeadingBlock extends BlockBase {
  readonly type: 'heading'
  readonly level: HeadingLevel
}

export interface TodoBlock extends BlockBase {
  readonly type: 'todo'
  readonly checked: boolean
}

export interface BulletedListBlock extends BlockBase {
  readonly type: 'bulletedList'
}

export interface NumberedListBlock extends BlockBase {
  readonly type: 'numberedList'
}

export interface ParagraphBlock extends BlockBase {
  readonly type: 'paragraph'
}

/**
 * The structural shape every block satisfies — including types registered
 * from outside this file. Generic constraints use this, so third-party block
 * types are accepted, while `Block` stays a closed union and keeps exhaustive
 * narrowing sharp for the built-ins.
 */
export interface BlockLike extends BlockBase {
  readonly type: string
}

export type Block =
  | HeadingBlock
  | TodoBlock
  | BulletedListBlock
  | NumberedListBlock
  | ParagraphBlock

export type BlockType = Block['type']

/** Narrow a block to a given type, for renderers and reducers. */
export function isBlockOfType<T extends BlockType>(
  block: Block,
  type: T,
): block is Extract<Block, { type: T }> {
  return block.type === type
}

/**
 * Whether the block draws a collapse arrow. There is no separate toggle
 * construct: anything with children hides them, which is what makes every
 * heading a toggle section without a marker of its own.
 */
export function isCollapsible(block: Block): boolean {
  return block.children.length > 0
}

/** Whether the block carries a checkbox the user can click. */
export function isCheckable(block: Block): block is TodoBlock {
  return block.type === 'todo'
}

/** Depth-first walk over a block tree, parents before children. */
export function* walk(blocks: readonly Block[]): Generator<Block> {
  for (const block of blocks) {
    yield block
    yield* walk(block.children)
  }
}

/** Find a block by id anywhere in the tree. */
export function findBlock(blocks: readonly Block[], id: string): Block | undefined {
  for (const block of walk(blocks)) {
    if (block.id === id) return block
  }
  return undefined
}

/**
 * Return a new tree where the block with `id` is replaced by `update(block)`.
 * Untouched branches keep their identity, so renderers can diff cheaply.
 */
export function mapBlock(
  blocks: readonly Block[],
  id: string,
  update: (block: Block) => Block,
): readonly Block[] {
  let changed = false

  const next = blocks.map((block) => {
    if (block.id === id) {
      // An updater that declines the change (wrong block type, same value)
      // must not force a new tree — callers rely on identity to skip work.
      const updated = update(block)
      if (updated !== block) changed = true
      return updated
    }
    const children = mapBlock(block.children, id, update)
    if (children !== block.children) {
      changed = true
      return { ...block, children } as Block
    }
    return block
  })

  return changed ? next : blocks
}
