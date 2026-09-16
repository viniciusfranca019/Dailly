/**
 * Structural tree operations, kept apart from the block model because they
 * exist to serve editing: every edit is "rebuild the one sibling list that
 * contains this block", so that is the single primitive everything else is
 * written against.
 */

import type { Block } from './blocks.js'

export interface BlockLocation {
  /** Undefined when the block sits at the top level. */
  readonly parent: Block | undefined
  readonly siblings: readonly Block[]
  readonly index: number
}

/** Where a block sits in the tree. */
export function locate(
  blocks: readonly Block[],
  id: string,
  parent?: Block,
): BlockLocation | undefined {
  const index = blocks.findIndex((block) => block.id === id)
  if (index >= 0) return { parent, siblings: blocks, index }

  for (const block of blocks) {
    const found = locate(block.children, id, block)
    if (found) return found
  }
  return undefined
}

/**
 * Rebuild the sibling list containing `id` with `update`, returning a new
 * tree — or undefined when the id is not in the tree. Insertion, removal,
 * indent and outdent are all expressed through this.
 */
export function updateSiblingsOf(
  blocks: readonly Block[],
  id: string,
  update: (siblings: readonly Block[], index: number) => readonly Block[],
): readonly Block[] | undefined {
  const index = blocks.findIndex((block) => block.id === id)
  if (index >= 0) return update(blocks, index)

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!
    const children = updateSiblingsOf(block.children, id, update)
    if (children) {
      const next = blocks.slice()
      next[i] = { ...block, children } as Block
      return next
    }
  }
  return undefined
}

/**
 * The block visually above this one's own line: the deepest last descendant
 * that is actually on screen. Children of a collapsed block are not.
 */
export function lastVisibleDescendant(block: Block): Block {
  let current = block
  while (!current.collapsed && current.children.length > 0) {
    current = current.children[current.children.length - 1]!
  }
  return current
}
