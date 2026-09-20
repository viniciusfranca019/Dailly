import { requestStoreContract } from '@dailly/requests-core/testing'
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { REQUESTS_MIGRATIONS } from './migrations.js'
import { sqliteRequestStore } from './sqlite-request-store.js'

/**
 * O banco vem da fatia do próprio módulo, não do `openDatabase` do shell.
 *
 * Não é purismo: a regra de fronteira proíbe um módulo de alcançar o interior
 * do shell, e ela está certa — o `shell/database` importa o runner, que lê o
 * manifest, que carrega todos os módulos. Aplicar a própria migration é mais
 * curto *e* deixa o teste em pé sem o resto do servidor.
 *
 * `foreign_keys` ligado à mão porque o `ON DELETE CASCADE` depende dele, e
 * SQLite o traz desligado por padrão — é o mesmo pragma que o `openDatabase`
 * liga em produção.
 */
const migrated = () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  for (const migration of REQUESTS_MIGRATIONS) db.exec(migration.up)
  return db
}

const make = () => sqliteRequestStore({ db: migrated() })

// A mesma suíte que o fake em memória passa. É o ponto inteiro da port: duas
// implementações, um conjunto de promessas, provado em vez de suposto.
requestStoreContract('sqliteRequestStore', { make })

describe('sqliteRequestStore além do contrato', () => {
  it('C1: o spec sobrevive ao round-trip pelo JSON do banco', async () => {
    // O `spec` é opaco para o SQL. Se o round-trip perder um campo aninhado,
    // perde em silêncio — e o defeito só aparece na hora de executar.
    const store = make()
    const spec = {
      metodo: 'POST',
      cabecalhos: [{ nome: 'A', valor: '1' }],
      aninhado: { fundo: { valor: 42, lista: [1, 'dois', null] } },
    }

    await store.saveRequest({
      id: 'r', name: 'n', protocol: 'protocolo-de-teste', spec, folderId: null, position: 0,
    })

    expect((await store.requestById('r'))?.spec).toEqual(spec)
  })

  it('C1: apagar a pasta leva as requests dentro dela', async () => {
    // `ON DELETE CASCADE` só funciona com `foreign_keys` ligado, e o
    // `openDatabase` liga. Sem isso a request ficaria apontando para uma pasta
    // que não existe e sumiria da árvore sem sumir do banco.
    const db = migrated()
    const withDb = sqliteRequestStore({ db })

    await withDb.saveFolder({ id: 'f', parentId: null, name: 'APIs', position: 0 })
    await withDb.saveRequest({
      id: 'r', name: 'n', protocol: 'p', spec: {}, folderId: 'f', position: 0,
    })
    db.prepare('DELETE FROM request_folders WHERE id = ?').run('f')

    expect(await withDb.requests()).toEqual([])
  })
})
