import { entryRepositoryContract } from '@dailly/domain/testing'
import { EntryNotFoundError, NotImplementedError } from '@dailly/domain'
import { UTC } from '@dailly/periods'
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { ENTRIES_MIGRATIONS } from './migrations.js'
import { sqliteEntryRepository } from './sqlite-entry-repository.js'

/**
 * O schema vem da fatia do próprio módulo, aplicada à mão: a regra de
 * fronteira mantém o módulo fora do shell (`openDatabase`), a mesma razão do
 * `sqlite-task-store.test.ts`.
 */
const migrated = () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  for (const migration of ENTRIES_MIGRATIONS) db.exec(migration.up)
  return db
}
/** Which file each repository writes to, so the contract can seed a label in it. */
const files = new WeakMap<object, Database.Database>()
const make = (zone = UTC) => {
  const db = migrated()
  const repository = sqliteEntryRepository({ db, zone })
  files.set(repository, db)
  return repository
}

// The same suite the in-memory fake passes. This is the whole point of the
// port: two implementations, one set of promises, proven rather than assumed.
entryRepositoryContract('sqliteEntryRepository', {
  make: () => make(),
  label: async (repository, name) => {
    const id = `label-${name}`
    files.get(repository)!.prepare('INSERT INTO labels (id, name, name_key, color) VALUES (?, ?, ?, ?)').run(id, name, name, 'blue')
    return id
  },
})

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

  it('C9: reads, updates and deletes only day logs, never the Entry of a task (RN6)', async () => {
    // update, delete and getById were Fase 2 and said so; card #33 made them
    // real, and what they must not do now is reach a task, whose Entry is
    // edited by the Tasks module and whose deletion would cascade to the task.
    const db = migrated()
    db.prepare(
      `INSERT INTO entries (id, body, occurred_at, created_at, updated_at, kind)
       VALUES ('task-entry', 'Comprar café', '2026-07-24T10:00:00.000Z', '2026-07-24T10:00:00.000Z', '2026-07-24T10:00:00.000Z', 'task')`,
    ).run()
    const entries = sqliteEntryRepository({ db, zone: UTC })

    expect(await entries.getById('task-entry')).toBeNull()
    await expect(entries.update('task-entry', { body: 'x', updatedAt: '2026-07-24T11:00:00.000Z' })).rejects.toThrow(
      EntryNotFoundError,
    )
    await expect(entries.delete('task-entry')).rejects.toThrow(EntryNotFoundError)
    expect(db.prepare(`SELECT body FROM entries WHERE id = 'task-entry'`).get()).toEqual({ body: 'Comprar café' })
  })
})
