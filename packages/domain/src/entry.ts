import type { ISODateTime } from './time.js'

/**
 * A Daily Log entry, per [ADR 0002 §2](../../../docs/adrs/0002-data-layer.md).
 *
 * `body` is markdown — and only the body is markdown. Labels and properties sit
 * beside it as columns and JSON; they never become block syntax. That is the
 * anchor decision in `docs/adaptacao-dailly.md`: *the whiteboard is the body of
 * the Entry, not the Entry.*
 */
export interface Entry {
  /** UUID, generated where the entry is created. */
  readonly id: string
  /** Markdown, already normalized — see `createEntry`. */
  readonly body: string
  /** When the fact happened. Delimits periods; defaults to `createdAt`. */
  readonly occurredAt: ISODateTime
  readonly createdAt: ISODateTime
  readonly updatedAt: ISODateTime
  readonly labelIds: readonly string[]
  readonly props: Readonly<Record<string, unknown>>
}

/**
 * What a caller supplies. Everything else about an `Entry` is derived, which is
 * why this type is not `Partial<Entry>`: `id`, `createdAt` and `updatedAt` are
 * not the caller's to choose.
 *
 * `labelIds` and `props` are accepted and stored as given. Phase 1 has no UI
 * for either (they are Phase 2), so in practice they arrive empty — but the
 * shape is here so the Phase 2 work is additive.
 */
export interface NewEntry {
  readonly body: string
  readonly occurredAt?: ISODateTime
  readonly labelIds?: readonly string[]
  readonly props?: Readonly<Record<string, unknown>>
}
