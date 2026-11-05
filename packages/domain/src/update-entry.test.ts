import { describe, expect, it } from 'vitest'
import { createEntry } from './create-entry.js'
import { deleteEntry } from './delete-entry.js'
import { EmptyBodyError, EntryNotFoundError } from './errors.js'
import { sequentialIds } from './ids.js'
import { inMemoryEntryRepository } from './in-memory-entry-repository.js'
import { fixedClock } from './time.js'
import { updateEntry } from './update-entry.js'

const setup = async () => {
  const entries = inMemoryEntryRepository()
  const created = await createEntry({ entries, clock: fixedClock('2026-07-24T10:00:00.000Z'), ids: sequentialIds() })({
    body: 'Reunião com o time',
  })
  return { entries, created, update: updateEntry({ entries, clock: fixedClock('2026-07-24T15:00:00.000Z') }) }
}

describe('updateEntry', () => {
  it('C2: changes the body, keeps the id and the creation, stamps the update (RN5)', async () => {
    const { entries, created, update } = await setup()

    const updated = await update(created.id, { body: 'Reunião com o time de dados' })

    expect(updated).toEqual({
      ...created,
      body: 'Reunião com o time de dados',
      updatedAt: '2026-07-24T15:00:00.000Z',
    })
    expect(await entries.getById(created.id)).toEqual(updated)
  })

  it('C3: moves the entry to another instant when one is given', async () => {
    const { created, update } = await setup()

    const updated = await update(created.id, { body: created.body, occurredAt: '2026-07-23T12:00:00.000Z' })

    expect(updated.occurredAt).toBe('2026-07-23T12:00:00.000Z')
  })

  it('normalizes the body the way createEntry does', async () => {
    const { created, update } = await setup()
    const updated = await update(created.id, { body: '* um item' })
    expect(updated.body).toBe('- um item')
  })

  it('C4: refuses a body that is empty once normalized, and keeps the entry', async () => {
    const { entries, created, update } = await setup()

    await expect(update(created.id, { body: '   \n\n' })).rejects.toBeInstanceOf(EmptyBodyError)
    expect(await entries.getById(created.id)).toEqual(created)
  })

  it('C6: refuses an entry that no longer exists', async () => {
    const { update } = await setup()
    await expect(update('00000000-0000-4000-8000-000000000999', { body: 'x' })).rejects.toBeInstanceOf(
      EntryNotFoundError,
    )
  })
})

describe('deleteEntry', () => {
  it('C7: removes the entry', async () => {
    const { entries, created } = await setup()

    await deleteEntry({ entries })(created.id)

    expect(await entries.list({})).toEqual([])
  })

  it('names the refusal for an unknown entry', async () => {
    const { entries } = await setup()
    await expect(deleteEntry({ entries })('00000000-0000-4000-8000-000000000999')).rejects.toThrow(
      'registro não encontrado',
    )
  })
})
