import type { TodoBlock } from '../blocks.js'
import type { BlockDefinition } from '../registry.js'

/**
 * Checkbox items. Accepts the bare Notion-style form and the GFM one:
 *
 *   []  task      [ ] task      [x] done
 *   - [ ] task    * [x] done    1. [ ] task
 *
 * Everything is normalized back to the bare `[] ` / `[x] ` form.
 */
const TODO = /^(?:[-*+]\s+|\d+[.)]\s+)?\[([ xX]?)\]\s*(.*)$/

export const todoDefinition: BlockDefinition<TodoBlock> = {
  type: 'todo',
  priority: 20,
  match: (line) => TODO.exec(line),
  parse: ({ match, children, nextId }) => ({
    type: 'todo',
    id: nextId(),
    checked: match[1]!.toLowerCase() === 'x',
    text: match[2]!.trim(),
    children,
    collapsed: false,
  }),
  serialize: (block) => `${block.checked ? '[x]' : '[]'} ${block.text}`.trimEnd(),
}
