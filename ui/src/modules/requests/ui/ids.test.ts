// @vitest-environment jsdom
import { sequentialIds } from '@dailly/domain'
import { describe, expect, it } from 'vitest'
import { testRequestsPort, testSharedDeps, testVaultPort } from '@shared/testing.js'
import { allAt, at, click, fill, mount, novaPasta, novaRequest, settle } from './test-harness.js'

/**
 * C3 — o id de uma pasta ou request nova vem da raiz de composição.
 *
 * O módulo não sorteia id: recebe um `IdGenerator`, como o `createEntry` das
 * entries já recebe. É o que deixa o teste dizer **qual** id a pasta ganhou,
 * em vez de só que ganhou algum.
 */
describe('C3: o id de uma pasta ou request nova vem do gerador que a raiz entrega', () => {
  it('a pasta nova leva o id do gerador', async () => {
    const port = testRequestsPort()
    const { host } = mount({ ...testSharedDeps(), requests: port, ids: sequentialIds('novo'), vault: testVaultPort() })
    await settle()

    await novaPasta(host)
    await fill(at(host, 'folder-name'), 'Stripe')
    await click(at(host, 'save-folder'))

    expect((await port.folders()).map((folder) => folder.id)).toEqual(['novo-1'])
  })

  it('a request nova leva o id do gerador', async () => {
    const port = testRequestsPort()
    const { host } = mount({ ...testSharedDeps(), requests: port, ids: sequentialIds('novo'), vault: testVaultPort() })
    await settle()

    await novaRequest(host)
    await fill(at(host, 'url'), 'curl https://x.dev/a')
    await click(at(host, 'save'))

    expect((await port.requests()).map((request) => request.id)).toEqual(['novo-1'])
    expect(allAt(host, 'request')).toHaveLength(1)
  })
})
