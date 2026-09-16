/**
 * Interaction contract between renderers and the host.
 *
 * Renderers never hold a reference to the document store: they tag an element
 * with `data-wb-action` and the host's single delegated listener turns that
 * into a store call. New interactive affordances only need a new action name.
 */

export const ACTION_ATTR = 'data-wb-action'
export const BLOCK_ID_ATTR = 'data-wb-id'
/** Marks the element that holds a block's editable text. */
export const TEXT_ATTR = 'data-wb-text'

export type BlockAction = 'check' | 'collapse'

/** Attributes to spread on the element that should trigger `action`. */
export function actionAttrs(action: BlockAction): Record<string, string> {
  return { [ACTION_ATTR]: action }
}
