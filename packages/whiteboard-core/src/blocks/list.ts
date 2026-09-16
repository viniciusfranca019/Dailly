import type { BulletedListBlock, NumberedListBlock } from '../blocks.js'
import type { BlockDefinition } from '../registry.js'

const BULLET = /^[-*+](?:\s+(.*))?$/
/** `1. item` or `1) item` — the written number is ignored, see serialize. */
const NUMBERED = /^\d+[.)](?:\s+(.*))?$/

export const bulletedListDefinition: BlockDefinition<BulletedListBlock> = {
  type: 'bulletedList',
  priority: 30,
  match: (line) => BULLET.exec(line),
  parse: ({ match, children, nextId }) => ({
    type: 'bulletedList',
    id: nextId(),
    text: (match[1] ?? '').trim(),
    children,
    collapsed: false,
  }),
  serialize: (block) => `- ${block.text}`.trimEnd(),
}

export const numberedListDefinition: BlockDefinition<NumberedListBlock> = {
  type: 'numberedList',
  priority: 31,
  match: (line) => NUMBERED.exec(line),
  parse: ({ match, children, nextId }) => ({
    type: 'numberedList',
    id: nextId(),
    text: (match[1] ?? '').trim(),
    children,
    collapsed: false,
  }),
  // Numbering is positional: a run of numbered siblings is renumbered from 1,
  // so the markdown always comes back normalized.
  serialize: (block, { index, siblings }) => `${ordinalOf(index, siblings)}. ${block.text}`.trimEnd(),
}

/** 1-based position of the block within its uninterrupted run of numbered siblings. */
export function ordinalOf(index: number, siblings: readonly { type: string }[]): number {
  let start = index
  while (start > 0 && siblings[start - 1]?.type === 'numberedList') start--
  return index - start + 1
}
