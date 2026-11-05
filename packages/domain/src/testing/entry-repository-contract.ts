import { describe, expect, it } from 'vitest'
import type { Entry } from '../entry.js'
import type { EntryRepository } from '../entry-repository.js'
import { EntryNotFoundError } from '../errors.js'

/**
 * The contract every `EntryRepository` owes, as an executable suite.
 *
 * This is what makes "trocar o adapter" a fact instead of a hope. The same
 * cases run against the in-memory fake here, against `SqliteEntryRepository` in
 * `server/`, and against `HttpEntryRepository` in `ui/`. A store that passes
 * these is substitutable; one that does not is a different port wearing the
 * same type.
 *
 * `update`, `delete` and `getById` joined with the Fase 2 use-cases that call
 * them (`updateEntry`, `deleteEntry`, card #33).
 */

export interface ContractOptions {
  /** A fresh, empty repository per test. */
  readonly make: () => EntryRepository | Promise<EntryRepository>
}

/**
 * A valid UUID derived from a counter.
 *
 * The fixtures used to carry readable ids like `'nova'`, and the end-to-end
 * suite caught it: an implementation behind HTTP validates what it is given and
 * rejects anything that is not a UUID — correctly, since ADR 0002 says ids are
 * UUIDs. A contract may only assume what every implementation promises, so the
 * ids here are real ones and the readable name lives in the body, where the
 * assertions read it.
 */
let minted = 0
const uuid = (): string => `${String(++minted).padStart(8, '0')}-0000-4000-8000-000000000000`

const entry = (name: string, occurredAt: string, over: Partial<Entry> = {}): Entry => ({
  id: uuid(),
  body: `corpo de ${name}`,
  occurredAt,
  createdAt: occurredAt,
  updatedAt: occurredAt,
  labelIds: [],
  props: {},
  ...over,
})

/** What the assertions compare on, now that ids are opaque. */
const bodies = (entries: readonly Entry[]): string[] => entries.map((entry) => entry.body)

export function entryRepositoryContract(name: string, { make }: ContractOptions): void {
  describe(`${name} honours the EntryRepository contract`, () => {
    it('stores an entry and gives it back', async () => {
      const entries = await make()
      const written = entry('a primeira', '2026-07-24T10:00:00.000Z')

      await entries.create(written)

      expect(await entries.list({})).toEqual([written])
    })

    it('returns entries newest first', async () => {
      // The mvp says it in one line: "as entradas são exibidas da mais recente
      // para a mais antiga". Insertion order is deliberately not date order.
      const entries = await make()
      await entries.create(entry('meio', '2026-07-15T12:00:00.000Z'))
      await entries.create(entry('velha', '2026-05-02T12:00:00.000Z'))
      await entries.create(entry('nova', '2026-07-24T12:00:00.000Z'))

      const found = await entries.list({})

      expect(bodies(found)).toEqual(['corpo de nova', 'corpo de meio', 'corpo de velha'])
    })

    it('breaks a tie on occurredAt by createdAt, newest first', async () => {
      // Two entries about the same moment still need a stable order, because
      // the mvp puts a new entry *at the top* of its day.
      const entries = await make()
      const at = '2026-07-24T12:00:00.000Z'
      await entries.create(entry('primeira', at))
      await entries.create(entry('segunda', at, { createdAt: '2026-07-24T18:00:00.000Z' }))

      const found = await entries.list({})

      expect(bodies(found)).toEqual(['corpo de segunda', 'corpo de primeira'])
    })

    it('is empty before anything is written', async () => {
      const entries = await make()
      expect(await entries.list({})).toEqual([])
    })

    it('filters by an inclusive date range', async () => {
      // "Quando filtro pelo período de 2026-07-01 a 2026-07-31, então apenas as
      // entradas de julho são exibidas" — and both ends are inclusive, so the
      // fixtures sit exactly on the boundaries.
      const entries = await make()
      await entries.create(entry('maio', '2026-05-31T23:00:00.000Z'))
      await entries.create(entry('primeiro de julho', '2026-07-01T00:30:00.000Z'))
      await entries.create(entry('último de julho', '2026-07-31T23:30:00.000Z'))
      await entries.create(entry('agosto', '2026-08-01T01:00:00.000Z'))

      const found = await entries.list({ from: '2026-07-01', to: '2026-07-31' })

      expect(bodies(found)).toEqual(['corpo de último de julho', 'corpo de primeiro de julho'])
    })

    it('preserves the body exactly as written', async () => {
      // The store does not normalize. `createEntry` already did, once, and a
      // store that normalized again would be a second opinion about the same
      // string — which is how two adapters start disagreeing.
      const entries = await make()
      const body = '# título\n\n- um\n  - aninhado\n[] tarefa'
      await entries.create(entry('ignorado', '2026-07-24T10:00:00.000Z', { body }))

      const [found] = await entries.list({})

      expect(found?.body).toBe(body)
    })

    it('finds an entry by id, and answers null for an unknown one', async () => {
      const entries = await make()
      const written = entry('achada', '2026-07-24T10:00:00.000Z')
      await entries.create(written)

      expect(await entries.getById(written.id)).toEqual(written)
      expect(await entries.getById(uuid())).toBeNull()
    })

    it('updates the body, the instant and the update stamp, and keeps the rest', async () => {
      const entries = await make()
      const written = entry('antes', '2026-07-24T10:00:00.000Z')
      await entries.create(written)

      const updated = await entries.update(written.id, {
        body: 'corpo de depois',
        occurredAt: '2026-07-23T12:00:00.000Z',
        updatedAt: '2026-07-24T11:00:00.000Z',
      })

      const expected = {
        ...written,
        body: 'corpo de depois',
        occurredAt: '2026-07-23T12:00:00.000Z',
        updatedAt: '2026-07-24T11:00:00.000Z',
      }
      expect(updated).toEqual(expected)
      expect(await entries.list({})).toEqual([expected])
    })

    it('refuses to update an entry that does not exist', async () => {
      const entries = await make()
      await expect(
        entries.update(uuid(), { body: 'x', updatedAt: '2026-07-24T11:00:00.000Z' }),
      ).rejects.toBeInstanceOf(EntryNotFoundError)
    })

    it('deletes an entry, and refuses one that does not exist', async () => {
      const entries = await make()
      const kept = entry('fica', '2026-07-24T10:00:00.000Z')
      const gone = entry('sai', '2026-07-24T11:00:00.000Z')
      await entries.create(kept)
      await entries.create(gone)

      await entries.delete(gone.id)

      expect(await entries.list({})).toEqual([kept])
      await expect(entries.delete(gone.id)).rejects.toBeInstanceOf(EntryNotFoundError)
    })
  })
}
