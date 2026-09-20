import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inMemoryEntryRepository } from '@dailly/domain'
import { UTC } from '@dailly/periods'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type RunningServer } from './index.js'
import { entriesModule } from './modules/entries/index.js'
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

describe('C3: a migration do módulo é a que roda de verdade', () => {
  /**
   * O terceiro membro do contrato, que os outros testes não exercitavam.
   *
   * `register()` tinha prova e `id` tinha prova; `migrations` não. O fake do
   * bloco acima declara `migrations: []`, então o caminho que leva a fatia de
   * um módulo até o arquivo passava por baixo de toda a suíte — e passava
   * mesmo com `openDatabase` e `migrate` ignorando a lista recebida.
   *
   * O defeito aqui é ausência de guarda, não comportamento errado: o teste
   * nasce verde contra a árvore limpa. O que ele prova é a regressão, e ela
   * foi verificada aplicando a mutação de verdade — `openDatabase` chamado sem
   * a lista no composition root derruba este teste, e só este.
   */
  let server: RunningServer | undefined
  let dir: string | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
    if (dir) await rm(dir, { recursive: true, force: true })
    dir = undefined
  })

  it('cria no arquivo a tabela que o módulo declarou, e para na versão dele', async () => {
    dir = await mkdtemp(join(tmpdir(), 'dailly-c3-'))
    const file = join(dir, 'dailly.sqlite')

    server = await createServer({ databaseFile: file }, [
      // O módulo de verdade entra junto: o composition root constrói o
      // repositório SQLite, que precisa da tabela `entries` da migration 1.
      entriesModule,
      fakeModule({
        id: 'com-schema',
        migrations: [{ version: 2, up: 'CREATE TABLE extra (id TEXT PRIMARY KEY);' }],
      }),
    ])
    await server.close()
    server = undefined

    const db = new Database(file, { readonly: true })
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((row) => row.name)

    expect(tables).toContain('extra')
    expect(db.pragma('user_version', { simple: true })).toBe(2)
    db.close()
  })
})
