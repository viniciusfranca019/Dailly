import type { HeadingBlock, HeadingLevel } from '../blocks.js'
import type { BlockDefinition } from '../registry.js'

/**
 * `# t` .. `#### t`. Every heading collapses whatever is nested under it, so
 * there is no separate toggle marker. The text is optional: a bare `#` is an
 * empty heading, not a paragraph — pressing Enter creates empty blocks all
 * the time.
 */
const HEADING = /^(#{1,4})(?:\s+(.*))?$/

export const headingDefinition: BlockDefinition<HeadingBlock> = {
  type: 'heading',
  priority: 10,
  match: (line) => HEADING.exec(line),
  parse: ({ match, children, nextId }) => ({
    type: 'heading',
    id: nextId(),
    level: match[1]!.length as HeadingLevel,
    text: (match[2] ?? '').trim(),
    children,
    collapsed: false,
  }),
  serialize: (block) => `${'#'.repeat(block.level)} ${block.text}`.trimEnd(),
}
