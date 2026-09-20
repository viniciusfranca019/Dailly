import { inMemoryEntryRepository } from '@dailly/domain'
import { UTC } from '@dailly/periods'
import { describe, expect, it } from 'vitest'
import { buildApp } from './shell/app.js'
import { ManifestError, assertManifest, type ServerModule } from './shell/module.js'

/**
 * C3 — um módulo entra pelo manifest, não por import no shell.
 *
 * O módulo aqui é escrito à mão, não mockado: o contrato que o teste exercita
 * é o mesmo que `entries` implementa, e um fake de módulo é a única forma de
 * provar a regra com um módulo só no manifest de verdade.
 *
 * A metade estrutural deste cenário — "o shell não importa o módulo em lugar
 * nenhum" — mora no `architecture.test.ts`, onde é verificável.
 */
const fakeModule = (over: Partial<ServerModule> = {}): ServerModule => ({
  id: 'fake',
  migrations: [],
  register(app) {
    app.get('/fake', async () => ({ from: 'o módulo, não o shell' }))
  },
  ...over,
})

const deps = () => ({ entries: inMemoryEntryRepository(), zone: UTC })

describe('C3: um módulo entra pelo manifest, não por import no shell', () => {
  it('responde na rota que o módulo registrou', async () => {
    const app = buildApp(deps(), [fakeModule()])

    const response = await app.inject({ method: 'GET', url: '/fake' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ from: 'o módulo, não o shell' })
  })

  it('entrega ao módulo as dependências resolvidas pelo shell', async () => {
    // O módulo não abre banco nem lê env: recebe o que o composition root já
    // resolveu. É o que permite trocar o repositório num teste sem tocar no
    // módulo.
    let seen: unknown
    const app = buildApp(deps(), [
      fakeModule({
        register(app, received) {
          seen = received.zone
          app.get('/fake', async () => ({ ok: true }))
        },
      }),
    ])
    await app.inject({ method: 'GET', url: '/fake' })

    expect(seen).toBe(UTC)
  })

  it('recusa um manifest com dois módulos de mesmo id, nomeando o id', async () => {
    expect(() => assertManifest([fakeModule(), fakeModule()])).toThrow(ManifestError)
    expect(() => assertManifest([fakeModule(), fakeModule()])).toThrow(/fake/)
  })

  it('recusa um manifest vazio — um build sem módulo nenhum é um erro de composição', () => {
    expect(() => assertManifest([])).toThrow(ManifestError)
  })
})
