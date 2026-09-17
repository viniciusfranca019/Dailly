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

/**
 * Every block on screen, in the order a reader meets them.
 *
 * "On screen" is the operative word: the children of a collapsed block are not,
 * so Shift+ArrowDown skips over a folded subtree instead of walking through
 * blocks nobody can see.
 */
export function visibleBlocksInOrder(blocks: readonly Block[]): Block[] {
  const found: Block[] = []
  const visit = (list: readonly Block[]): void => {
    for (const block of list) {
      found.push(block)
      if (!block.collapsed) visit(block.children)
    }
  }
  visit(blocks)
  return found
}

/**
 * The selected blocks that no other selected block contains.
 *
 * Selecting a parent already takes its subtree along — moving it moves
 * everything under it. So an operation only ever acts on these roots, and a
 * child that happens to also be in the set is not moved twice.
 */
export function selectionRoots(blocks: readonly Block[], ids: Iterable<string>): Block[] {
  const wanted = new Set(ids)
  const roots: Block[] = []
  const visit = (list: readonly Block[], insideSelection: boolean): void => {
    for (const block of list) {
      const selected = wanted.has(block.id)
      if (selected && !insideSelection) roots.push(block)
      visit(block.children, insideSelection || selected)
    }
  }
  visit(blocks, false)
  return roots
}

/** A stretch of adjacent siblings — what every structural edit actually acts on. */
export interface SiblingRun {
  /** Undefined when the run sits at the top level. */
  readonly parent: Block | undefined
  readonly siblings: readonly Block[]
  readonly from: number
  /** Inclusive. */
  readonly to: number
}

/**
 * The run these roots form, or `undefined` when they do not form one.
 *
 * Structural edits are defined on adjacent siblings and on nothing else. Roots
 * under different parents, or with a gap between them, are refused rather than
 * partially applied: a move that silently rearranges half of what was selected
 * is worse than a move that does not happen.
 */
export function contiguousRun(
  blocks: readonly Block[],
  roots: readonly Block[],
): SiblingRun | undefined {
  const first = roots[0] && locate(blocks, roots[0].id)
  if (!first) return undefined

  const indices: number[] = []
  for (const root of roots) {
    const location = locate(blocks, root.id)
    if (!location || location.parent?.id !== first.parent?.id) return undefined
    indices.push(location.index)
  }

  indices.sort((left, right) => left - right)
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1]! + 1) return undefined
  }

  return {
    parent: first.parent,
    siblings: first.siblings,
    from: indices[0]!,
    to: indices[indices.length - 1]!,
  }
}
