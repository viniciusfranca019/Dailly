import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './errors.js'
import { httpLabelsClient } from './http-labels-client.js'

const respondWith = (body: unknown, status = 200) =>
  vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(status === 204 ? null : JSON.stringify(body), { status }),
  )
const subject = (fetch: typeof globalThis.fetch) => httpLabelsClient({ config: { baseUrl: '/api' }, fetch })
const work = { id: 'a', name: 'trabalho', color: 'blue' }

describe('httpLabelsClient', () => {
  it('lists the labels', async () => {
    expect(await subject(respondWith([work])).list()).toEqual([work])
  })

  it('posts a new label', async () => {
    const fetch = respondWith(work, 201)
    expect(await subject(fetch).create({ name: 'trabalho', color: 'blue' })).toEqual(work)
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('/api/labels')
    expect(init?.method).toBe('POST')
  })

  it('C4: a taken name arrives as the message to show', async () => {
    const fetch = respondWith({ error: 'já existe uma label com esse nome' }, 409)
    await expect(subject(fetch).create({ name: 'Trabalho', color: 'blue' })).rejects.toThrow(
      'já existe uma label com esse nome',
    )
  })

  it('patches a label, and a 404 is null', async () => {
    expect(await subject(respondWith({ ...work, name: 'job' })).update('a', { name: 'job' })).toEqual({ ...work, name: 'job' })
    expect(await subject(respondWith({ error: 'label não encontrada' }, 404)).update('a', { name: 'job' })).toBeNull()
  })

  it('deletes a label, and a 404 is false', async () => {
    expect(await subject(respondWith(null, 204)).delete('a')).toBe(true)
    expect(await subject(respondWith({ error: 'label não encontrada' }, 404)).delete('a')).toBe(false)
  })

  it('refuses a label in a shape it does not know', async () => {
    await expect(subject(respondWith([{ id: 'a', name: 'x', color: '#fff' }])).list()).rejects.toBeInstanceOf(ApiError)
  })
})
