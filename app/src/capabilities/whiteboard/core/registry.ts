/**
 * The block registry: the single extension point of the whiteboard.
 *
 * Every markdown construct is described by a `BlockDefinition` that knows
 * three things and nothing else:
 *
 *   - `match`  : does this (already dedented) line belong to me?
 *   - `parse`  : build the block from the match and its parsed children
 *   - `serialize`: write the block back as one markdown line
 *
 * Definitions are tried in ascending `priority`, so more specific syntaxes
 * win over looser ones (`> ## x` before `## x`, `## x` before a paragraph).
 * Registering a new construct is a single file plus one `register()` call.
 */

import type { Block, BlockLike } from './blocks.js'

/** What a definition receives when it is asked to build a block. */
export interface ParseContext {
  /** The line with its indentation removed. */
  readonly line: string
  /** Result of this definition's own `match`. */
  readonly match: RegExpExecArray
  /** Already-parsed nested blocks (lines indented under this one). */
  readonly children: readonly Block[]
  /** Fresh, document-unique block id. */
  readonly nextId: () => string
}

/** What a definition receives when it is asked to write markdown back. */
export interface SerializeContext {
  /** Position of the block among its siblings, 0-based. */
  readonly index: number
  readonly siblings: readonly Block[]
}

export interface BlockDefinition<T extends BlockLike = Block> {
  readonly type: T['type']
  /**
   * Lower runs first. The paragraph fallback sits at
   * `PARAGRAPH_PRIORITY` and must stay last.
   */
  readonly priority: number
  match(line: string): RegExpExecArray | null
  parse(ctx: ParseContext): T
  /** One markdown line, without indentation — the serializer adds it. */
  serialize(block: T, ctx: SerializeContext): string
}

/** Reserved for the catch-all paragraph definition. */
export const PARAGRAPH_PRIORITY = 1000

export class BlockRegistry {
  #definitions: BlockDefinition<BlockLike>[] = []
  #byType = new Map<string, BlockDefinition<BlockLike>>()

  /** Register (or replace, by type) a block definition. */
  register<T extends BlockLike>(definition: BlockDefinition<T>): this {
    const existing = this.#byType.get(definition.type)
    if (existing) {
      this.#definitions = this.#definitions.filter((d) => d !== existing)
    }

    // Stored widened: the registry treats definitions uniformly, while each
    // definition stays strictly typed at its own declaration site.
    const widened = definition as unknown as BlockDefinition<BlockLike>
    this.#byType.set(definition.type, widened)
    this.#definitions.push(widened)
    this.#definitions.sort((a, b) => a.priority - b.priority)
    return this
  }

  /** All definitions, in the order the parser should try them. */
  definitions(): readonly BlockDefinition<BlockLike>[] {
    return this.#definitions
  }

  get(type: string): BlockDefinition<BlockLike> | undefined {
    return this.#byType.get(type)
  }

  /** First definition whose `match` accepts the line, with its match result. */
  resolve(
    line: string,
  ): { definition: BlockDefinition<BlockLike>; match: RegExpExecArray } | undefined {
    for (const definition of this.#definitions) {
      const match = definition.match(line)
      if (match) return { definition, match }
    }
    return undefined
  }

  /** Independent copy — register on it without touching the original. */
  clone(): BlockRegistry {
    const copy = new BlockRegistry()
    for (const definition of this.#definitions) copy.register(definition)
    return copy
  }
}
