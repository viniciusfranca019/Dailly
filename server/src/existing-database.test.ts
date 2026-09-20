import { copyFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { LATEST_VERSION, createServer, type RunningServer } from './index.js'

/**
 * C1 — um banco existente abre sem reaplicar migration.
 *
 * A fixture foi escrita pelo código **pré-refactor** (`src/__fixtures__/v1.sqlite`,
 * `user_version = 1`, uma entrada dentro). É essa procedência que dá valor ao
 * teste: um arquivo gerado pelo código novo só provaria que ele concorda
 * consigo mesmo.
 *
 * Um banco em memória não serviria. O risco que este cenário cobre é uma
 * migration reaplicada sobre um arquivo que já está na versão dela — e um
 * `:memory:` nasce sempre na versão 0, então nunca chega perto do defeito.
 *
 * A cópia para um diretório temporário existe porque abrir o banco o modifica
 * (WAL), e uma fixture que o teste altera deixa de ser fixture na segunda
 * execução.
 */
const FIXTURE = fileURLToPath(new URL('./__fixtures__/v1.sqlite', import.meta.url))

describe('C1: um banco existente sobe de versão sem reaplicar o que já rodou', () => {
  let server: RunningServer | undefined
  let dir: string | undefined

  const openCopy = async (): Promise<string> => {
    dir = await mkdtemp(join(tmpdir(), 'dailly-c1-'))
    const file = join(dir, 'dailly.sqlite')
    copyFileSync(FIXTURE, file)
    return file
  }

  afterEach(async () => {
    await server?.close()
    server = undefined
    if (dir) await rm(dir, { recursive: true, force: true })
    dir = undefined
  })

  it('leva o arquivo até a versão deste build, sem reaplicar a migration 1', async () => {
    // **O cenário mudou, e a mudança estava prevista.** Quando ele foi
    // aprovado, o build conhecia uma migration só, e "o `user_version`
    // continua 1" era a mesma frase que "nada foi reaplicado". O módulo
    // Requests trouxe a migration 2, e as duas frases se separaram: continuar
    // em 1 passou a significar que o schema novo *não* chegou.
    //
    // O invariante que valia continua valendo, e é este: a migration 1 não
    // roda de novo. A prova é dupla — se ela rodasse, o `CREATE TABLE entries`
    // estouraria com tabela já existente, e a linha que estava lá sumiria.
    const file = await openCopy()

    server = await createServer({ databaseFile: file })
    await server.close()
    server = undefined

    const db = new Database(file, { readonly: true })
    expect(db.pragma('user_version', { simple: true })).toBe(LATEST_VERSION)
    expect(LATEST_VERSION).toBeGreaterThan(1)
    // A linha da fixture sobreviveu à subida de versão.
    expect(db.prepare('SELECT count(*) AS total FROM entries').get()).toEqual({ total: 1 })
    // E o schema novo chegou junto.
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'requests'").get()).toBeTruthy()
    db.close()
  })

  it('devolve pela API a entrada que já estava no arquivo', async () => {
    const file = await openCopy()

    server = await createServer({ databaseFile: file })

    const listed = await fetch(`${server.url}/entries`)

    expect(listed.status).toBe(200)
    expect(await listed.json()).toEqual([
      {
        id: '0f8f9b2a-3c4d-4e5f-8a9b-0c1d2e3f4a5b',
        body: '# antes do refactor\n- uma entrada real',
        occurredAt: '2026-09-14T22:30:00.000Z',
        createdAt: '2026-09-14T22:30:00.000Z',
        updatedAt: '2026-09-14T22:30:00.000Z',
        labelIds: [],
        props: {},
      },
    ])
  })
})
