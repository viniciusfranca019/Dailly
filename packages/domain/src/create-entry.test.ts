import { describe, expect, it } from 'vitest'
import { createEntry } from './create-entry.js'
import { EmptyBodyError } from './errors.js'
import { sequentialIds } from './ids.js'
import { inMemoryEntryRepository } from './in-memory-entry-repository.js'
import { fixedClock } from './time.js'

const NOW = '2026-09-16T14:30:00.000Z'

const subject = (entries = inMemoryEntryRepository()) => ({
  entries,
  create: createEntry({ entries, clock: fixedClock(NOW), ids: sequentialIds() }),
})

describe('createEntry', () => {
  it('persists the entry and puts it on the timeline', async () => {
    const { entries, create } = subject()

    const created = await create({ body: 'Descobri um padrão melhor para o adapter' })

    expect(created.id).toBe('entry-1')
    expect(await entries.list({})).toEqual([created])
  })

  it('refuses an empty body', async () => {
    const { create } = subject()
    await expect(create({ body: '' })).rejects.toThrow(EmptyBodyError)
  })

  it('refuses a body that is only whitespace, because normalizing empties it', async () => {
    // The mvp only says "deixo o corpo em branco". Blank lines and spaces are
    // what a user actually leaves behind, and normalization drops both — so the
    // check has to happen after it, not before.
    const { create } = subject()
    await expect(create({ body: '   \n\n  \n' })).rejects.toThrow(EmptyBodyError)
  })

  it('normalizes the body once, on the way in', async () => {
    // Everything on the left is valid markdown the user may type; everything on
    // the right is the canonical form `serialize` emits. Storing the canonical
    // form is what makes a later save-without-editing a real no-op.
    const { create } = subject()

    const created = await create({ body: '* um\n+ dois\n5. três\n- [x] feito' })

    expect(created.body).toBe('- um\n- dois\n1. três\n[x] feito')
  })

  it('stores a body that is already canonical unchanged', async () => {
    const { create } = subject()
    const body = '# título\n- um\n  - aninhado\n[] tarefa'

    const created = await create({ body })

    expect(created.body).toBe(body)
  })

  it('drops the blank line between blocks, which the user will notice', async () => {
    // Worth its own test because it is the one normalization that changes what
    // someone typed on purpose rather than a marker they did not care about.
    // Blank lines are not part of the model (`docs/adaptacao-dailly.md` §3), so
    // a body written with breathing room comes back without it — once, at
    // creation, and never again.
    const { create } = subject()

    const created = await create({ body: '# título\n\n- um\n\n- dois' })

    expect(created.body).toBe('# título\n- um\n- dois')
  })

  it('defaults occurredAt to now, and stamps both timestamps with it', async () => {
    const { create } = subject()

    const created = await create({ body: 'sem data' })

    expect(created).toMatchObject({ occurredAt: NOW, createdAt: NOW, updatedAt: NOW })
  })

  it('keeps an occurredAt in the past while createdAt stays now', async () => {
    // "Uma entrada escrita hoje sobre um fato do mês passado entra no resumo do
    // mês passado" (ADR 0007). The two dates answer different questions.
    const { create } = subject()

    const created = await create({ body: 'fato antigo', occurredAt: '2026-07-24T09:00:00.000Z' })

    expect(created.occurredAt).toBe('2026-07-24T09:00:00.000Z')
    expect(created.createdAt).toBe(NOW)
  })

  it('defaults labels and props to empty rather than undefined', async () => {
    const { create } = subject()

    const created = await create({ body: 'sem metadado' })

    expect(created.labelIds).toEqual([])
    expect(created.props).toEqual({})
  })

  it('gives each entry its own id', async () => {
    const { create } = subject()

    const first = await create({ body: 'uma' })
    const second = await create({ body: 'outra' })

    expect(first.id).not.toBe(second.id)
  })
})
