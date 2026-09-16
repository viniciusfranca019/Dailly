import { describe, expect, it } from 'vitest'
import type { Entry } from '../entry.js'
import type { EntryRepository } from '../entry-repository.js'

/**
 * The contract every `EntryRepository` owes, as an executable suite.
 *
 * This is what makes "trocar o adapter" a fact instead of a hope. The same
 * cases run against the in-memory fake here, against `SqliteEntryRepository` in
 * `server/`, and against `HttpEntryRepository` in `ui/`. A store that passes
 * these is substitutable; one that does not is a different port wearing the
 * same type.
 *
 * It covers only what Phase 1 implements — `create` and `list`. `update`,
 * `delete` and `getById` join when the Phase 2 use-cases that call them do.
 */

export interface ContractOptions {
  /** A fresh, empty repository per test. */
  readonly make: () => EntryRepository | Promise<EntryRepository>
}

const entry = (over: Partial<Entry> & Pick<Entry, 'id' | 'occurredAt'>): Entry => ({
  body: `corpo de ${over.id}`,
  createdAt: over.occurredAt,
  updatedAt: over.occurredAt,
  labelIds: [],
  props: {},
  ...over,
})

export function entryRepositoryContract(name: string, { make }: ContractOptions): void {
  describe(`${name} honours the EntryRepository contract`, () => {
    it('stores an entry and gives it back', async () => {
      const entries = await make()
      const written = entry({ id: 'a', occurredAt: '2026-07-24T10:00:00.000Z' })

      await entries.create(written)

      expect(await entries.list({})).toEqual([written])
    })

    it('returns entries newest first', async () => {
      // The mvp says it in one line: "as entradas são exibidas da mais recente
      // para a mais antiga". Insertion order is deliberately not date order.
      const entries = await make()
      await entries.create(entry({ id: 'meio', occurredAt: '2026-07-15T12:00:00.000Z' }))
      await entries.create(entry({ id: 'velha', occurredAt: '2026-05-02T12:00:00.000Z' }))
      await entries.create(entry({ id: 'nova', occurredAt: '2026-07-24T12:00:00.000Z' }))

      const found = await entries.list({})

      expect(found.map((found) => found.id)).toEqual(['nova', 'meio', 'velha'])
    })

    it('breaks a tie on occurredAt by createdAt, newest first', async () => {
      // Two entries about the same moment still need a stable order, because
      // the mvp puts a new entry *at the top* of its day.
      const entries = await make()
      const at = '2026-07-24T12:00:00.000Z'
      await entries.create(entry({ id: 'primeira', occurredAt: at, createdAt: at }))
      await entries.create({
        ...entry({ id: 'segunda', occurredAt: at }),
        createdAt: '2026-07-24T18:00:00.000Z',
      })

      const found = await entries.list({})

      expect(found.map((found) => found.id)).toEqual(['segunda', 'primeira'])
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
      await entries.create(entry({ id: 'maio', occurredAt: '2026-05-31T23:00:00.000Z' }))
      await entries.create(entry({ id: 'primeiro-de-julho', occurredAt: '2026-07-01T00:30:00.000Z' }))
      await entries.create(entry({ id: 'ultimo-de-julho', occurredAt: '2026-07-31T23:30:00.000Z' }))
      await entries.create(entry({ id: 'agosto', occurredAt: '2026-08-01T01:00:00.000Z' }))

      const found = await entries.list({ from: '2026-07-01', to: '2026-07-31' })

      expect(found.map((found) => found.id)).toEqual(['ultimo-de-julho', 'primeiro-de-julho'])
    })

    it('preserves the body exactly as written', async () => {
      // The store does not normalize. `createEntry` already did, once, and a
      // store that normalized again would be a second opinion about the same
      // string — which is how two adapters start disagreeing.
      const entries = await make()
      const body = '# título\n\n- um\n  - aninhado\n[] tarefa'
      await entries.create({ ...entry({ id: 'a', occurredAt: '2026-07-24T10:00:00.000Z' }), body })

      const [found] = await entries.list({})

      expect(found?.body).toBe(body)
    })
  })
}
