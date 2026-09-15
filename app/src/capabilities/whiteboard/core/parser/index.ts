/**
 * Phase 2 of parsing: indentation-aware lines -> block tree.
 *
 * Nesting is owned entirely by this module: any line indented deeper than
 * the one before it becomes its child. Block definitions therefore only ever
 * see a single, already-dedented line and never worry about structure.
 */

import type { Block } from '../blocks.js'
import type { BlockRegistry } from '../registry.js'
import { createDefaultRegistry } from '../blocks/index.js'
import { scanLines, type ScanOptions, type SourceLine } from './lines.js'

export { scanLines, DEFAULT_TAB_WIDTH } from './lines.js'
export type { SourceLine, ScanOptions } from './lines.js'

export interface ParseOptions extends ScanOptions {
  readonly registry?: BlockRegistry
  /** Injectable for deterministic ids in tests. */
  readonly createId?: (index: number) => string
}

export function parse(source: string, options: ParseOptions = {}): Block[] {
  const registry = options.registry ?? createDefaultRegistry()
  const createId = options.createId ?? ((index: number) => `b${index}`)

  let counter = 0
  const nextId = () => createId(counter++)

  return buildBlocks(scanLines(source, options), registry, nextId)
}

function buildBlocks(
  lines: readonly SourceLine[],
  registry: BlockRegistry,
  nextId: () => string,
): Block[] {
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!
    if (line.blank) {
      i++
      continue
    }

    // Everything indented deeper (blank lines included, so a paragraph break
    // inside a toggle does not end it) belongs to this block.
    let end = i + 1
    while (end < lines.length) {
      const next = lines[end]!
      if (next.blank || next.indent > line.indent) end++
      else break
    }

    const children = buildBlocks(lines.slice(i + 1, end), registry, nextId)
    const block = createBlock(line.content, children, registry, nextId)
    if (block) blocks.push(block)
    i = end
  }

  return blocks
}

function createBlock(
  content: string,
  children: readonly Block[],
  registry: BlockRegistry,
  nextId: () => string,
): Block | undefined {
  const resolved = registry.resolve(content)
  if (!resolved) return undefined
  // Definitions registered from outside the core produce blocks beyond the
  // built-in union; the tree stores them structurally.
  return resolved.definition.parse({
    line: content,
    match: resolved.match,
    children,
    nextId,
  }) as Block
}
