import { describe, expect, it } from 'vitest'
import { inMemoryEntryRepository } from './in-memory-entry-repository.js'
import { queryEntries } from './query-entries.js'
import type { Entry } from './entry.js'

const entry = (id: string, occurredAt: string, labelIds: string[] = []): Entry => ({
  id,
  body: `corpo de ${id}`,
  occurredAt,
  createdAt: occurredAt,
  updatedAt: occurredAt,
  labelIds,
  props: {},
})

describe('queryEntries', () => {
  it('reads the whole timeline, newest first', async () => {
    const entries = inMemoryEntryRepository([
      entry('velha', '2026-05-02T12:00:00.000Z'),
      entry('nova', '2026-07-24T12:00:00.000Z'),
    ])

    const found = await queryEntries({ entries })()

    expect(found.map((found) => found.id)).toEqual(['nova', 'velha'])
  })

  it('passes the filter through to the repository', async () => {
    const entries = inMemoryEntryRepository([
      entry('julho', '2026-07-10T12:00:00.000Z'),
      entry('maio', '2026-05-10T12:00:00.000Z'),
    ])

    const found = await queryEntries({ entries })({ from: '2026-07-01', to: '2026-07-31' })

    expect(found.map((found) => found.id)).toEqual(['julho'])
  })
})
