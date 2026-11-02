import { inMemoryEntryRepository } from '@dailly/domain'
import { UTC } from '@dailly/periods'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AlreadyImportedError, ApiDownError, runImport } from './import-apidog.js'
import { buildApp } from './shell/app.js'
import { openDatabase } from './shell/database.js'

/** O script contra a API de verdade, ouvindo numa porta — o caminho do `make import-apidog`. */
let app: FastifyInstance
let baseUrl: string

beforeEach(async () => {
  app = buildApp({ entries: inMemoryEntryRepository(), zone: UTC, db: openDatabase(':memory:') })
  await app.listen({ host: '127.0.0.1', port: 0 })
  const address = app.server.address()
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
})

afterEach(async () => {
  await app.close()
})

const sequential = () => {
  let n = 0
  return () => `id-${++n}`
}

const COLLECTION = {
  info: { name: 'API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: [
    {
      name: 'Stripe',
      item: [
        {
          name: 'Cobranças',
          item: [{ name: 'criar', request: { method: 'POST', header: [], url: { raw: '{{baseUrl}}/v1/charges' } } }],
        },
      ],
    },
    { name: 'ws', request: { method: 'GET', url: 'wss://x.dev' } },
  ],
}

describe('o script grava pela API', () => {
  it('I1 ponta a ponta: a árvore chega inteira e o relatório conta o que entrou e o que ficou de fora', async () => {
    const report = await runImport({ collection: COLLECTION, baseUrl, nextId: sequential() })

    const folders = (await app.inject({ method: 'GET', url: '/requests/folders' })).json() as { name: string }[]
    const requests = (await app.inject({ method: 'GET', url: '/requests' })).json() as { name: string }[]
    expect(folders.map((f) => f.name).sort()).toEqual(['Apidog', 'Cobranças', 'Stripe'])
    expect(requests.map((r) => r.name)).toEqual(['criar'])
    expect(report).toMatchObject({ folders: 3, requests: 1, variables: ['baseUrl'], skipped: [{ path: 'ws' }] })
  })

  it('I4: com a pasta Apidog já lá, recusa sem gravar nada e diz como refazer', async () => {
    await runImport({ collection: COLLECTION, baseUrl, nextId: sequential() })
    const before = (await app.inject({ method: 'GET', url: '/requests' })).json() as unknown[]

    const again = runImport({ collection: COLLECTION, baseUrl, nextId: () => `outro-${Math.random()}` })

    await expect(again).rejects.toThrow(AlreadyImportedError)
    await expect(again).rejects.toThrow(/apague a pasta "Apidog"/)
    expect((await app.inject({ method: 'GET', url: '/requests' })).json()).toHaveLength(before.length)
  })

  it('I6: com a API fora do ar, para antes de converter e diz a porta e o comando', async () => {
    await app.close()
    const attempt = runImport({ collection: { nada: true }, baseUrl, nextId: sequential() })
    await expect(attempt).rejects.toThrow(ApiDownError)
    await expect(attempt).rejects.toThrow(new RegExp(`${baseUrl.split(':').pop()}.*make start`))
  })
})
