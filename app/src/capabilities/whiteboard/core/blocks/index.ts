import { BlockRegistry } from '../registry.js'
import { headingDefinition } from './heading.js'
import { todoDefinition } from './todo.js'
import { bulletedListDefinition, numberedListDefinition } from './list.js'
import { paragraphDefinition } from './paragraph.js'

export { headingDefinition } from './heading.js'
export { todoDefinition } from './todo.js'
export { bulletedListDefinition, numberedListDefinition, ordinalOf } from './list.js'
export { paragraphDefinition } from './paragraph.js'

/**
 * The block set the whiteboard ships with. Call it to get a fresh registry
 * you can extend without leaking definitions into other documents.
 */
export function createDefaultRegistry(): BlockRegistry {
  return new BlockRegistry()
    .register(headingDefinition)
    .register(todoDefinition)
    .register(bulletedListDefinition)
    .register(numberedListDefinition)
    .register(paragraphDefinition)
}
