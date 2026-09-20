import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from '../index.js'
import { ManifestError, type ServerModule } from './module.js'
import { collectMigrations } from './migrations.js'

/**
 * C4 — versão de migration duplicada derruba o boot nomeando o culpado.
 *
 * `user_version` é uma sequência global e linear: os módulos contribuem
 * arrays, e nada no tipo impede dois deles de escolherem o mesmo número. A
 * coordenação é manual; esta asserção é o que a torna segura.
 *
 * O ponto exato da falha importa. Coletar acontece **antes** de abrir o banco,
 * então um manifest inconsistente nunca chega a escrever no arquivo — é a
 * diferença entre um boot que falha e um banco pela metade.
 */
const moduleWith = (id: string, versions: number[]): ServerModule => ({
  id,
  migrations: versions.map((version) => ({
    version,
    up: `CREATE TABLE t_${id}_${version} (id TEXT PRIMARY KEY);`,
  })),
  register() {},
})

describe('C4: versão de migration duplicada derruba o boot nomeando o culpado', () => {
  let dir: string | undefined

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
    dir = undefined
  })

  it('nomeia a versão em conflito e os dois módulos', () => {
    const collect = () => collectMigrations([moduleWith('entries', [1]), moduleWith('requests', [1])])

    expect(collect).toThrow(ManifestError)
    expect(collect).toThrow(/1/)
    expect(collect).toThrow(/entries/)
    expect(collect).toThrow(/requests/)
  })

  it('ordena as migrations de módulos diferentes numa sequência só', () => {
    const collected = collectMigrations([moduleWith('a', [1, 4]), moduleWith('b', [2, 3])])

    expect(collected.map((migration) => migration.version)).toEqual([1, 2, 3, 4])
  })

  it('não aplica migration nenhuma quando o manifest é inconsistente', async () => {
    // A asserção que importa não é "o boot lançou" — é que o arquivo continua
    // na versão 0. Um boot que falha depois de escrever metade do schema é
    // pior que um que não sobe.
    dir = await mkdtemp(join(tmpdir(), 'dailly-c4-'))
    const file = join(dir, 'dailly.sqlite')
    new Database(file).close()

    await expect(
      createServer({ databaseFile: file }, [moduleWith('a', [1]), moduleWith('b', [1])]),
    ).rejects.toThrow(ManifestError)

    const db = new Database(file, { readonly: true })
    expect(db.pragma('user_version', { simple: true })).toBe(0)
    db.close()
  })
})
