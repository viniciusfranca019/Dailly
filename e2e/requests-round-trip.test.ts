import { createServer, type RunningServer } from '../server/src/index.js'
import { httpRequestsClient } from '../ui/src/adapters/http-requests-client.js'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * A porta de Requests da UI contra o servidor de verdade, num socket.
 *
 * A suíte da tela roda contra o fake do `requests-core`, que concorda com o
 * servidor no **contrato** do store — mas não no HTTP. Foi assim que apagar
 * nunca funcionou no app e nenhum teste viu: o cliente mandava
 * `content-type: application/json` num DELETE sem corpo, e o Fastify recusa
 * isso com 400. Só as duas metades juntas pegam esse tipo de coisa.
 */
const running: RunningServer[] = []

afterAll(async () => {
  await Promise.all(running.map((server) => server.close()))
})

async function overTheWire() {
  const server = await createServer({ databaseFile: ':memory:' })
  running.push(server)
  return httpRequestsClient({ config: { baseUrl: server.url } })
}

const request = (id: string, folderId: string | null) => ({
  id,
  name: id,
  protocol: 'http',
  spec: { method: 'GET', url: 'https://x.dev', headers: [], body: null, query: [], auth: null },
  folderId,
  position: 0,
})

describe('a porta de Requests contra o servidor de verdade', () => {
  it('salva, renomeia, move e apaga — request e pasta', async () => {
    const port = await overTheWire()

    await port.saveFolder({ id: 'a', parentId: null, name: 'A', position: 0 })
    await port.saveFolder({ id: 'b', parentId: null, name: 'B', position: 1 })
    await port.saveRequest(request('r1', 'a'))
    await port.saveRequest(request('r2', null))

    await port.saveFolder({ id: 'b', parentId: 'a', name: 'B renomeada', position: 0 })
    await port.saveRequest({ ...request('r2', 'b'), name: 'movida' })
    expect((await port.folders()).find((f) => f.id === 'b')).toMatchObject({ parentId: 'a', name: 'B renomeada' })
    expect((await port.requests()).find((r) => r.id === 'r2')).toMatchObject({ folderId: 'b', name: 'movida' })

    await port.deleteRequest('r1')
    expect((await port.requests()).map((r) => r.id)).toEqual(['r2'])

    await port.deleteFolder('a')
    expect(await port.folders()).toEqual([])
    expect(await port.requests()).toEqual([])
  })
})
