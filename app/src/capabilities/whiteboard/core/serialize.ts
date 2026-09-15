/**
 * Block tree -> markdown.
 *
 * Serialization is the reason the whiteboard is more than decorative: a click
 * on a checkbox has to come back out as `[x]` in the source. Output is
 * normalized (a canonical marker per block type, ordered lists renumbered,
 * fixed indent unit), so `parse -> serialize` is idempotent.
 */

import type { Block } from './blocks.js'
import type { BlockRegistry } from './registry.js'
import { createDefaultRegistry } from './blocks/index.js'

export interface SerializeOptions {
  readonly registry?: BlockRegistry
  /** Spaces added per nesting level. */
  readonly indentWidth?: number
}

export const DEFAULT_INDENT_WIDTH = 2

export function serialize(blocks: readonly Block[], options: SerializeOptions = {}): string {
  const registry = options.registry ?? createDefaultRegistry()
  const indentWidth = options.indentWidth ?? DEFAULT_INDENT_WIDTH

  const lines: string[] = []
  writeBlocks(blocks, 0, lines, registry, indentWidth)
  return lines.join('\n')
}

function writeBlocks(
  blocks: readonly Block[],
  depth: number,
  out: string[],
  registry: BlockRegistry,
  indentWidth: number,
): void {
  const pad = ' '.repeat(depth * indentWidth)

  blocks.forEach((block, index) => {
    const definition = registry.get(block.type)
    if (!definition) {
      throw new Error(`No block definition registered for type "${block.type}"`)
    }

    const line = definition.serialize(block, { index, siblings: blocks })
    out.push(line.length > 0 ? `${pad}${line}` : '')
    writeBlocks(block.children, depth + 1, out, registry, indentWidth)
  })
}
