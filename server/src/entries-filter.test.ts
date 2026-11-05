import { uuidIds } from '@dailly/domain'
import { UTC } from '@dailly/periods'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './shell/app.js'
import { openDatabase } from './shell/database.js'

/** Card #36 over HTTP: GET /entries filters by labels (OR) and properties (AND). */
let app: ReturnType<typeof buildApp>
let work: string
let health: string

beforeEach(async () => {
  app = buildApp({ db: openDatabase(':memory:'), zone: UTC })
  work = (await app.inject({ method: 'POST', url: '/labels', payload: { name: 'trabalho', color: 'blue' } })).json().id
  health = (await app.inject({ method: 'POST', url: '/labels', payload: { name: 'saúde', color: 'green' } })).json().id
  await app.inject({ method: 'POST', url: '/property-defs', payload: { key: 'humor', type: 'text' } })
  await app.inject({ method: 'POST', url: '/property-defs', payload: { key: 'horas', type: 'number' } })
  await app.inject({ method: 'POST', url: '/property-defs', payload: { key: 'dormiu', type: 'boolean' } })
  const post = (body: string, labelIds: string[], props: object, day: string) =>
    app.inject({
      method: 'POST',
      url: '/entries',
      payload: { id: uuidIds.next(), body, occurredAt: `${day}T10:00:00.000Z`, createdAt: `${day}T10:00:00.000Z`, updatedAt: `${day}T10:00:00.000Z`, labelIds, props },
    })
  await post('trabalho bom', [work], { humor: 'bom' }, '2026-07-24')
  await post('saúde bom', [health], { humor: 'bom', horas: 7.5, dormiu: true }, '2026-07-23')
  await post('sem label', [], { humor: 'ruim' }, '2026-07-22')
})

const bodies = async (query: string) => {
  const response = await app.inject({ method: 'GET', url: `/entries?${query}` })
  expect(response.statusCode).toBe(200)
  return response.json().map((entry: { body: string }) => entry.body)
}

describe('GET /entries filtered (C6)', () => {
  it('C1: one label', async () => {
    expect(await bodies(`labelIds=${work}`)).toEqual(['trabalho bom'])
  })

  it('C2: two labels add up (OR)', async () => {
    expect(await bodies(`labelIds=${work},${health}`)).toEqual(['trabalho bom', 'saúde bom'])
  })

  it('C3: a property narrows (AND), and never 501', async () => {
    expect(await bodies(`labelIds=${work},${health}&props[humor]=bom`)).toEqual(['trabalho bom', 'saúde bom'])
    expect(await bodies(`props[humor]=ruim`)).toEqual(['sem label'])
  })

  it('reads a number and a yes/no by the type of the key', async () => {
    expect(await bodies(`props[horas]=7,5&props[dormiu]=sim`)).toEqual(['saúde bom'])
  })

  it('C5: nothing matches is an empty list', async () => {
    expect(await bodies(`labelIds=${work}&props[humor]=ruim`)).toEqual([])
  })

  it('combines with the period (AND)', async () => {
    expect(await bodies(`from=2026-07-23&props[humor]=bom`)).toEqual(['trabalho bom', 'saúde bom'])
    expect(await bodies(`to=2026-07-23&props[humor]=bom`)).toEqual(['saúde bom'])
  })

  it('refuses a key with no definition or a value outside its type, with 400', async () => {
    const unknown = await app.inject({ method: 'GET', url: '/entries?props[cor]=azul' })
    const wrong = await app.inject({ method: 'GET', url: '/entries?props[horas]=abc' })
    expect([unknown.statusCode, wrong.statusCode]).toEqual([400, 400])
    expect(wrong.json().errors[0].message).toBe('horas espera um número')
  })
})
