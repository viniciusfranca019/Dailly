/**
 * Renderer registry — the view-side twin of the parser's BlockRegistry.
 *
 * Parsing and rendering are registered separately on purpose: a new block type
 * needs one `BlockDefinition` (syntax) and one `BlockRenderer` (appearance),
 * and either can be swapped without touching the other. Porting the whiteboard
 * to React/Svelte means reimplementing only this half.
 */

import type { Block, BlockLike } from '@dailly/whiteboard-core'

export interface RenderContext {
  readonly doc: Document
  /** Position among siblings — ordered lists need it for their number. */
  readonly index: number
  readonly siblings: readonly Block[]
  /**
   * Inline markdown hook. Currently plain text; bold/italic/links become a
   * one-place change here rather than a change in every renderer.
   */
  readonly renderInline: (text: string) => Node
  /** Rendered subtree, or null when the block is collapsed or has no children. */
  readonly renderChildren: (block: BlockLike) => HTMLElement | null
}

export interface BlockRenderer<T extends BlockLike = Block> {
  readonly type: T['type']
  /** The block's own content row; the host wraps it and appends children. */
  render(block: T, ctx: RenderContext): HTMLElement
}

export class RendererRegistry {
  #byType = new Map<string, BlockRenderer<BlockLike>>()

  register<T extends BlockLike>(renderer: BlockRenderer<T>): this {
    this.#byType.set(renderer.type, renderer as unknown as BlockRenderer<BlockLike>)
    return this
  }

  get(type: string): BlockRenderer<BlockLike> | undefined {
    return this.#byType.get(type)
  }

  clone(): RendererRegistry {
    const copy = new RendererRegistry()
    for (const renderer of this.#byType.values()) copy.register(renderer)
    return copy
  }
}
