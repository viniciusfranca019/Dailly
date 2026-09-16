/**
 * Framework-agnostic whiteboard core: markdown in, interactive block tree out,
 * markdown back. Contains no DOM access — pick an adapter from `src/adapters`.
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
