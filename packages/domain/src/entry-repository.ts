import type { Entry } from './entry.js'

/**
 * How a caller narrows a listing. `from`/`to` are **calendar dates**
 * (`YYYY-MM-DD`, inclusive), not instants — per [ADR 0002 §1].
 *
 * That difference is the whole reason `@dailly/periods` exists: turning a date
 * plus a zone into instant bounds is a conversion, and it happens in the
 * adapter that owns the zone (the server), never here. The domain filters on
 * what the repository returns.
 */
export interface EntryFilter {
  /** ISO date, inclusive. */
  readonly from?: string
  /** ISO date, inclusive. */
  readonly to?: string
  /** OR between labels. */
  readonly labelIds?: readonly string[]
  readonly props?: Readonly<Record<string, unknown>>
}

/**
 * The port. Per [ADR 0002 §1] the repository interface — not the SQL table — is
 * the source of truth, and in production there is exactly one implementation.
 *
 * **Deviation from ADR 0002, recorded (Emenda 1 da ADR 0002):** that ADR wrote
 * `create(input: NewEntry)`. Here `create` takes a complete `Entry`. The reason
 * is a decision taken after it: ADR 0007 put an HTTP boundary in the middle, and
 * the use-cases run on the renderer side of it (see `index.ts`). If `create`
 * took a `NewEntry`, every adapter would have to mint the id and the timestamps
 * — which would either duplicate that logic per adapter or move it to the
 * server, contradicting ADR 0002 §6's "UUID gerado no cliente". So the use-case
 * builds the whole record and the repository stores it.
 *
 * What the store still owes: validation. An adapter is free to reject a
 * malformed record, and the HTTP one must (it is reachable from outside the
 * domain). Guarding the store is not the same as redoing the domain.
 *
 * `list` returns newest `occurredAt` first — ordering is the port's promise,
 * not each caller's chore, and the shared contract test proves every
 * implementation keeps it.
 */
export interface EntryRepository {
  create(entry: Entry): Promise<Entry>
  list(filter: EntryFilter): Promise<Entry[]>

  // Declared because the port is declared whole; implemented in Phase 2, when
  // the use-cases that call them exist (`updateEntry`, `deleteEntry`).
  update(id: string, patch: Partial<Entry>): Promise<Entry>
  delete(id: string): Promise<void>
  getById(id: string): Promise<Entry | null>
}
