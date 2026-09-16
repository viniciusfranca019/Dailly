import { entryRepositoryContract } from '@dailly/domain/testing'
import { NotImplementedError } from '@dailly/domain'
import { UTC } from '@dailly/periods'
import { describe, expect, it } from 'vitest'
import { openDatabase } from './database.js'
import { sqliteEntryRepository } from './sqlite-entry-repository.js'

const make = (zone = UTC) => sqliteEntryRepository({ db: openDatabase(':memory:'), zone })

// The same suite the in-memory fake passes. This is the whole point of the
// port: two implementations, one set of promises, proven rather than assumed.
entryRepositoryContract('sqliteEntryRepository', { make: () => make() })

describe('sqliteEntryRepository beyond the contract', () => {
  it('reads the date filter in the configured zone, not in UTC', () => {
    // The contract test runs in UTC, so it cannot see this. An entry at
    // 01:00Z on the 1st of August happened on the 31st of July in São Paulo,
    // and a filter for July must therefore include it. Getting this wrong is
    // invisible until someone writes late at night.
    const entries = make('America/Sao_Paulo')
    const at = '2026-08-01T01:00:00.000Z'

    return (async () => {
      await entries.create({
        id: 'a',
        body: 'escrita às 22h de São Paulo',
        occurredAt: at,
        createdAt: at,
        updatedAt: at,
        labelIds: [],
        props: {},
      })

      expect(await entries.list({ from: '2026-07-01', to: '2026-07-31' })).toHaveLength(1)
      expect(await entries.list({ from: '2026-08-01', to: '2026-08-31' })).toHaveLength(0)
    })()
  })

  it('round-trips props as JSON', async () => {
    const entries = make()
    const at = '2026-07-24T10:00:00.000Z'
    await entries.create({
      id: 'b',
      body: 'com propriedades',
      occurredAt: at,
      createdAt: at,
      updatedAt: at,
      labelIds: [],
      props: { humor: 'bom', horas: 3, ok: true },
    })

    const [found] = await entries.list({})

    expect(found?.props).toEqual({ humor: 'bom', horas: 3, ok: true })
  })

  it('refuses a label filter instead of quietly returning everything', async () => {
    // There is no entry_labels table until Fase 2. Ignoring the filter would
    // return too much, which looks like working software.
    const entries = make()
    await expect(entries.list({ labelIds: ['ideia'] })).rejects.toThrow(NotImplementedError)
  })

  it('says out loud that update, delete and getById are Fase 2', async () => {
    const entries = make()
    await expect(entries.update('a', {})).rejects.toThrow(NotImplementedError)
    await expect(entries.delete('a')).rejects.toThrow(NotImplementedError)
    await expect(entries.getById('a')).rejects.toThrow(NotImplementedError)
  })
})
