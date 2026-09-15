import type { ParagraphBlock } from '../blocks.js'
import type { BlockDefinition } from '../registry.js'
import { PARAGRAPH_PRIORITY } from '../registry.js'

/** Catch-all: matches any line, so it must stay last. */
const ANY = /^(.*)$/

export const paragraphDefinition: BlockDefinition<ParagraphBlock> = {
  type: 'paragraph',
  priority: PARAGRAPH_PRIORITY,
  match: (line) => ANY.exec(line),
  parse: ({ match, children, nextId }) => ({
    type: 'paragraph',
    id: nextId(),
    text: match[1]!.trim(),
    children,
    collapsed: false,
  }),
  serialize: (block) => block.text,
}
