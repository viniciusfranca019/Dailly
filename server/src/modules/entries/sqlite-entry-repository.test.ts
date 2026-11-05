import { entryRepositoryContract } from '@dailly/domain/testing'
import { EntryNotFoundError } from '@dailly/domain'
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
  // The store does not check values against definitions; the routes do.
  property: async () => {},
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

  it('C6: a property filter reads the value in its JSON type', async () => {
    // The contract filters text, number and yes/no; this pins the yes/no
    // mapping, since json_extract answers a JSON true as the integer 1.
    const entries = make()
    const at = '2026-07-24T10:00:00.000Z'
    const base = { occurredAt: at, createdAt: at, updatedAt: at, labelIds: [] }
    await entries.create({ ...base, id: 'yes', body: 'dormiu', props: { dormiu: true } })
    await entries.create({ ...base, id: 'no', body: 'não dormiu', props: { dormiu: false } })

    expect((await entries.list({ props: { dormiu: false } })).map((entry) => entry.id)).toEqual(['no'])
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

describe('migration 7 (card #35)', () => {
  it('defines the keys already stored in entries, by the JSON type of their values', () => {
    // Before F3 the API stored any props as given, so a diary may already
    // carry keys with no definition; without one, the entry could not be
    // corrected (the API checks every key it is sent).
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    const [seven, ...earlier] = [...ENTRIES_MIGRATIONS].sort((a, b) => b.version - a.version)
    for (const migration of earlier.reverse()) db.exec(migration.up)
    db.prepare(
      `INSERT INTO entries (id, body, occurred_at, created_at, updated_at, props)
       VALUES ('old', 'antigo', '2026-07-24T10:00:00.000Z', '2026-07-24T10:00:00.000Z', '2026-07-24T10:00:00.000Z', ?)`,
    ).run(JSON.stringify({ mood: 'ok', horas: 3, ok: true, nada: null }))

    db.exec(seven!.up)

    expect(db.prepare('SELECT key, type FROM property_defs ORDER BY key').all()).toEqual([
      { key: 'horas', type: 'number' },
      { key: 'mood', type: 'text' },
      { key: 'ok', type: 'boolean' },
    ])
  })
})
