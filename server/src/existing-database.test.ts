import { copyFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type RunningServer } from './index.js'

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

describe('C1: um banco existente abre sem reaplicar migration', () => {
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

  it('mantém o user_version em 1 depois de abrir', async () => {
    const file = await openCopy()

    server = await createServer({ databaseFile: file })
    await server.close()
    server = undefined

    const db = new Database(file, { readonly: true })
    expect(db.pragma('user_version', { simple: true })).toBe(1)
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
