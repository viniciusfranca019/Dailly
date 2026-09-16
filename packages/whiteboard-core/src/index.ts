/**
 * Framework-agnostic whiteboard core: markdown in, interactive block tree out,
 * markdown back.
 *
 * It lives in `packages/` rather than in `ui/` because two runtimes need the
 * same model: the renderer edits it, and `createEntry` normalizes markdown on
 * the way in (ADR 0007, Emenda 1). It contains no DOM access and no framework —
 * `tsconfig.json` drops the DOM lib so that stays true. The rendering adapter
 * is a consumer, not a part: `ui/src/capabilities/whiteboard/dom`.
 *
 * The seam with the product is markdown, and it already exists:
 *
 *   const body = doc.toMarkdown()   // persist
 *   doc.setMarkdown(entry.body)     // restore
 */

export type {
  Block,
  BlockBase,
  BlockLike,
  BlockType,
  BulletedListBlock,
  HeadingBlock,
  HeadingLevel,
  NumberedListBlock,
  ParagraphBlock,
  TodoBlock,
} from './blocks.js'
export { findBlock, isBlockOfType, isCheckable, isCollapsible, mapBlock, walk } from './blocks.js'

export { BlockRegistry, PARAGRAPH_PRIORITY } from './registry.js'
export type { BlockDefinition, ParseContext, SerializeContext } from './registry.js'

export {
  createDefaultRegistry,
  headingDefinition,
  todoDefinition,
  bulletedListDefinition,
  numberedListDefinition,
  paragraphDefinition,
  ordinalOf,
} from './blocks/index.js'

export { parse, scanLines, DEFAULT_TAB_WIDTH } from './parser/index.js'
export type { ParseOptions, ScanOptions, SourceLine } from './parser/index.js'

export { serialize, DEFAULT_INDENT_WIDTH } from './serialize.js'
export type { SerializeOptions } from './serialize.js'

export { WhiteboardDocument } from './document.js'
export type { DocumentListener, DocumentOptions } from './document.js'
