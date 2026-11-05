import { parsePropertyValue, uuidIds } from '@dailly/domain'
import { UTC } from '@dailly/periods'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './shell/app.js'
import { openDatabase } from './shell/database.js'

/** Card #35 over HTTP: the property definitions and the values an entry carries. */
let app: ReturnType<typeof buildApp>
beforeEach(() => {
  app = buildApp({ db: openDatabase(':memory:'), zone: UTC })
})

const define = (payload: object) => app.inject({ method: 'POST', url: '/property-defs', payload })
const anEntry = (props: Record<string, unknown> = {}) => {
  const at = '2026-07-24T10:00:00.000Z'
  return { id: uuidIds.next(), body: 'Dia', occurredAt: at, createdAt: at, updatedAt: at, labelIds: [], props }
}
const post = (entry: object) => app.inject({ method: 'POST', url: '/entries', payload: entry })

describe('/property-defs', () => {
  it('C3: defines a key with its type once, and lists the keys for the suggestion', async () => {
    expect((await define({ key: ' dormiu ', type: 'boolean' })).statusCode).toBe(201)
    await define({ key: 'horas', type: 'number' })
    const listed = (await app.inject({ method: 'GET', url: '/property-defs' })).json()
    expect(listed).toEqual([
      { key: 'dormiu', type: 'boolean' },
      { key: 'horas', type: 'number' },
    ])
  })

  it('the type of a key never changes: defining it again is 409', async () => {
    await define({ key: 'horas', type: 'number' })
    const again = await define({ key: 'horas', type: 'text' })
    expect(again.statusCode).toBe(409)
    expect(again.json().error).toBe('horas já tem tipo')
  })

  it('C5: refuses an empty key and an unknown type', async () => {
    expect((await define({ key: '  ', type: 'text' })).statusCode).toBe(400)
    expect((await define({ key: 'data', type: 'date' })).statusCode).toBe(400)
  })
})

describe('properties on an entry', () => {
  it('C1: an entry posted with a defined property carries it back', async () => {
    await define({ key: 'humor', type: 'text' })
    await post(anEntry({ humor: 'bom' }))
    expect((await app.inject({ method: 'GET', url: '/entries' })).json()[0].props).toEqual({ humor: 'bom' })
  })

  it('C4, C7: a value outside the type is 400 with the reason', async () => {
    await define({ key: 'horas', type: 'number' })
    const response = await post(anEntry({ horas: 'abc' }))
    expect(response.statusCode).toBe(400)
    expect(response.json().errors[0]).toEqual({ field: 'props', message: 'horas espera um número' })
  })

  it('a key with no definition is 400', async () => {
    const response = await post(anEntry({ humor: 'bom' }))
    expect(response.statusCode).toBe(400)
    expect(response.json().errors[0].message).toBe('humor não tem tipo definido')
  })

  it('C6: a correction replaces the properties, and the key stays defined', async () => {
    await define({ key: 'humor', type: 'text' })
    const entry = anEntry({ humor: 'bom' })
    await post(entry)

    const response = await app.inject({
      method: 'PATCH',
      url: `/entries/${entry.id}`,
      payload: { props: {}, updatedAt: '2026-07-24T11:00:00.000Z' },
    })

    expect(response.json().props).toEqual({})
    expect((await app.inject({ method: 'GET', url: '/property-defs' })).json()).toEqual([{ key: 'humor', type: 'text' }])
  })

  it('C7: a correction with a value outside the type is 400, and the entry keeps its value', async () => {
    await define({ key: 'horas', type: 'number' })
    const entry = anEntry({ horas: 7 })
    await post(entry)

    const response = await app.inject({
      method: 'PATCH',
      url: `/entries/${entry.id}`,
      payload: { props: { horas: 'abc' }, updatedAt: '2026-07-24T11:00:00.000Z' },
    })

    expect(response.statusCode).toBe(400)
    expect((await app.inject({ method: 'GET', url: `/entries/${entry.id}` })).json().props).toEqual({ horas: 7 })
  })
})

describe('one refusal text (Law 2)', () => {
  it('the API names a wrong value with the words the screen uses', async () => {
    await define({ key: 'horas', type: 'number' })
    await define({ key: 'dormiu', type: 'boolean' })
    const response = await post(anEntry({ horas: 'abc', dormiu: 'talvez' }))
    const screen = (key: string, type: 'number' | 'boolean', raw: string) =>
      (parsePropertyValue(key, type, raw) as { error: string }).error
    expect(response.json().errors.map((error: { message: string }) => error.message)).toEqual([
      screen('horas', 'number', 'abc'),
      screen('dormiu', 'boolean', 'talvez'),
    ])
  })
})
