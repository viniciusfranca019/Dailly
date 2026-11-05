import { uuidIds } from '@dailly/domain'
import { UTC } from '@dailly/periods'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './shell/app.js'
import { openDatabase } from './shell/database.js'

/** Card #34 over HTTP: the global labels and the labels an entry carries. */
let app: ReturnType<typeof buildApp>
beforeEach(() => {
  app = buildApp({ db: openDatabase(':memory:'), zone: UTC })
})

const createLabel = (payload: object) => app.inject({ method: 'POST', url: '/labels', payload })
const labels = async () => (await app.inject({ method: 'GET', url: '/labels' })).json()
const anEntry = (labelIds: string[] = []) => {
  const at = '2026-07-24T10:00:00.000Z'
  return { id: uuidIds.next(), body: 'Reunião', occurredAt: at, createdAt: at, updatedAt: at, labelIds, props: {} }
}

describe('POST /labels', () => {
  it('C2: creates a label with a palette color', async () => {
    const response = await createLabel({ name: '  saúde ', color: 'green' })
    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({ name: 'saúde', color: 'green' })
    expect(await labels()).toEqual([response.json()])
  })

  it('C3: refuses an empty name', async () => {
    const response = await createLabel({ name: '   ', color: 'green' })
    expect(response.statusCode).toBe(400)
    expect(await labels()).toEqual([])
  })

  it('C4: refuses a name that exists in another case, accents included (RN1)', async () => {
    await createLabel({ name: 'Saúde', color: 'green' })
    const response = await createLabel({ name: 'SAÚDE', color: 'red' })
    expect(response.statusCode).toBe(409)
    expect(response.json().error).toBe('já existe uma label com esse nome')
  })

  it('refuses a color outside the palette', async () => {
    expect((await createLabel({ name: 'casa', color: '#ff0000' })).statusCode).toBe(400)
  })
})

describe('labels on an entry', () => {
  it('C1: an entry posted with a label carries it back', async () => {
    const work = (await createLabel({ name: 'trabalho', color: 'blue' })).json()
    const entry = anEntry([work.id])
    await app.inject({ method: 'POST', url: '/entries', payload: entry })
    expect((await app.inject({ method: 'GET', url: '/entries' })).json()[0].labelIds).toEqual([work.id])
  })

  it('refuses an entry with a label that does not exist, with 400', async () => {
    const response = await app.inject({ method: 'POST', url: '/entries', payload: anEntry([uuidIds.next()]) })
    expect(response.statusCode).toBe(400)
    expect(response.json().errors[0].field).toBe('labelIds')
  })

  it('C5: a correction replaces the labels', async () => {
    const work = (await createLabel({ name: 'trabalho', color: 'blue' })).json()
    const entry = anEntry([work.id])
    await app.inject({ method: 'POST', url: '/entries', payload: entry })

    const response = await app.inject({
      method: 'PATCH',
      url: `/entries/${entry.id}`,
      payload: { labelIds: [], updatedAt: '2026-07-24T11:00:00.000Z' },
    })

    expect(response.json().labelIds).toEqual([])
    expect((await labels()).map((label: { name: string }) => label.name)).toEqual(['trabalho'])
  })
})

describe('PATCH /labels/:id', () => {
  it('C6: renames and recolors; every entry shows the new label', async () => {
    const work = (await createLabel({ name: 'trabalho', color: 'blue' })).json()
    const response = await app.inject({ method: 'PATCH', url: `/labels/${work.id}`, payload: { name: 'job', color: 'green' } })
    expect(response.json()).toEqual({ id: work.id, name: 'job', color: 'green' })
  })

  it('C7: refuses an empty name or one another label has, and keeps the label', async () => {
    const job = (await createLabel({ name: 'job', color: 'blue' })).json()
    await createLabel({ name: 'saúde', color: 'green' })

    const empty = await app.inject({ method: 'PATCH', url: `/labels/${job.id}`, payload: { name: '' } })
    const taken = await app.inject({ method: 'PATCH', url: `/labels/${job.id}`, payload: { name: 'Saúde' } })

    expect([empty.statusCode, taken.statusCode]).toEqual([400, 409])
    expect((await labels()).find((label: { id: string }) => label.id === job.id).name).toBe('job')
  })

  it('renaming to its own name in another case is allowed', async () => {
    const job = (await createLabel({ name: 'job', color: 'blue' })).json()
    const response = await app.inject({ method: 'PATCH', url: `/labels/${job.id}`, payload: { name: 'Job' } })
    expect(response.statusCode).toBe(200)
  })

  it('answers 404 for an unknown label', async () => {
    const response = await app.inject({ method: 'PATCH', url: `/labels/${uuidIds.next()}`, payload: { name: 'x' } })
    expect(response.statusCode).toBe(404)
  })
})

describe('DELETE /labels/:id', () => {
  it('C8: takes the label off every entry and keeps the entries (RN2)', async () => {
    const job = (await createLabel({ name: 'job', color: 'blue' })).json()
    await app.inject({ method: 'POST', url: '/entries', payload: anEntry([job.id]) })
    await app.inject({ method: 'POST', url: '/entries', payload: anEntry([job.id]) })

    const response = await app.inject({ method: 'DELETE', url: `/labels/${job.id}` })

    expect(response.statusCode).toBe(204)
    const entries = (await app.inject({ method: 'GET', url: '/entries' })).json()
    expect(entries).toHaveLength(2)
    expect(entries.every((entry: { labelIds: string[] }) => entry.labelIds.length === 0)).toBe(true)
  })

  it('answers 404 for an unknown label', async () => {
    expect((await app.inject({ method: 'DELETE', url: `/labels/${uuidIds.next()}` })).statusCode).toBe(404)
  })
})
