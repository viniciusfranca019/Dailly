export { mountWhiteboard } from './whiteboard.js'
export type { MountOptions, WhiteboardHandle } from './whiteboard.js'
export { RendererRegistry } from './registry.js'
export type { BlockRenderer, RenderContext } from './registry.js'
export {
  createDefaultRendererRegistry,
  headingRenderer,
  todoRenderer,
  bulletedListRenderer,
  numberedListRenderer,
  paragraphRenderer,
} from './renderers/index.js'
export { ACTION_ATTR, BLOCK_ID_ATTR, TEXT_ATTR, actionAttrs } from './actions.js'
export { getCaretOffset, hasSelection, insertTextAtCaret, setCaret, textNodeOf } from './caret.js'
export type { BlockAction } from './actions.js'
export { el } from './dom.js'
