import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './errors.js'
import { httpPropertiesClient } from './http-properties-client.js'

const respondWith = (body: unknown, status = 200) =>
  vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(body), { status }))
const subject = (fetch: typeof globalThis.fetch) => httpPropertiesClient({ config: { baseUrl: '/api' }, fetch })

describe('httpPropertiesClient', () => {
  it('lists the definitions', async () => {
    expect(await subject(respondWith([{ key: 'horas', type: 'number' }])).list()).toEqual([{ key: 'horas', type: 'number' }])
  })

  it('defines a key', async () => {
    const fetch = respondWith({ key: 'dormiu', type: 'boolean' }, 201)
    expect(await subject(fetch).define('dormiu', 'boolean')).toEqual({ key: 'dormiu', type: 'boolean' })
    expect(JSON.parse(fetch.mock.calls[0]![1]?.body as string)).toEqual({ key: 'dormiu', type: 'boolean' })
  })

  it('a key already typed arrives as the message to show', async () => {
    await expect(subject(respondWith({ error: 'horas já tem tipo' }, 409)).define('horas', 'text')).rejects.toThrow('horas já tem tipo')
  })

  it('refuses a type it does not know', async () => {
    await expect(subject(respondWith([{ key: 'x', type: 'date' }])).list()).rejects.toBeInstanceOf(ApiError)
  })
})
