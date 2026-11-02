import { inMemoryEntryRepository } from '@dailly/domain'
import { UTC } from '@dailly/periods'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from './shell/app.js'
import { openDatabase } from './shell/database.js'

const FAST = { N: 2 ** 10, r: 8, p: 1 }
const SECRET_KEY = randomBytes(32).toString('base64')

/** `null` é "sem .env" — `undefined` cairia no padrão. */
const appWith = (db = openDatabase(':memory:'), secretKey: string | null = SECRET_KEY) =>
  buildApp({ entries: inMemoryEntryRepository(), zone: UTC, db, kdf: FAST, ...(secretKey ? { secretKey } : {}) })

const call = (app: FastifyInstance, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url, ...(payload ? { payload } : {}) })

const created = async (app: FastifyInstance) => {
  const response = await call(app, 'POST', '/vault', { password: 'uma senha longa' })
  expect(response.statusCode).toBe(201)
  return response.json() as { recoveryKey: string }
}

let dir: string | undefined
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
  dir = undefined
})

describe('C1/C2/C3 pelas rotas', () => {
  it('cria, tranca, recusa a senha errada e abre com a certa', async () => {
    const app = appWith()
    expect((await call(app, 'GET', '/vault')).json()).toEqual({ state: 'nao-criado' })

    const { recoveryKey } = await created(app)
    expect(recoveryKey).toMatch(/^[A-Z2-7-]+$/)
    expect((await call(app, 'POST', '/vault', { password: 'outra senha longa' })).statusCode).toBe(409)

    expect((await call(app, 'POST', '/vault/lock')).statusCode).toBe(204)
    expect((await call(app, 'GET', '/vault')).json()).toEqual({ state: 'trancado' })

    const wrong = await call(app, 'POST', '/vault/unlock', { password: 'errada demais' })
    expect(wrong.statusCode).toBe(401)
    expect(wrong.json().error).toMatch(/não abre o cofre/)

    expect((await call(app, 'POST', '/vault/unlock', { password: 'uma senha longa' })).statusCode).toBe(204)
    expect((await call(app, 'GET', '/vault')).json()).toEqual({ state: 'aberto' })
  })

  it('recusa uma senha curta na criação, dizendo o mínimo', async () => {
    const response = await call(appWith(), 'POST', '/vault', { password: 'curta' })
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toMatch(/8/)
  })

  it('sem DAILLY_SECRET_KEY, diz o que falta e recusa criar', async () => {
    const app = appWith(openDatabase(':memory:'), null)
    expect((await call(app, 'GET', '/vault')).json()).toEqual({ state: 'sem-chave', missing: 'DAILLY_SECRET_KEY', created: false })
    const response = await call(app, 'POST', '/vault', { password: 'uma senha longa' })
    expect(response.statusCode).toBe(412)
    expect(response.json().error).toMatch(/DAILLY_SECRET_KEY/)
  })

  it('abre pela chave de recuperação e troca a senha', async () => {
    const app = appWith()
    const { recoveryKey } = await created(app)
    await call(app, 'POST', '/vault/lock')

    expect((await call(app, 'POST', '/vault/unlock', { recoveryKey })).statusCode).toBe(204)
    expect((await call(app, 'PUT', '/vault/password', { password: 'a senha nova longa' })).statusCode).toBe(204)
    await call(app, 'POST', '/vault/lock')

    expect((await call(app, 'POST', '/vault/unlock', { password: 'uma senha longa' })).statusCode).toBe(401)
    expect((await call(app, 'POST', '/vault/unlock', { password: 'a senha nova longa' })).statusCode).toBe(204)
  })
})

describe('C4: gravar, listar e revelar', () => {
  it('a listagem só tem nomes; revelar devolve o valor com no-store; trancado é 423', async () => {
    const app = appWith()
    await created(app)

    expect((await call(app, 'PUT', '/secrets/default/stripe_key', { value: 'sk_live_123' })).statusCode).toBe(204)

    const list = await call(app, 'GET', '/secrets')
    expect(list.json()).toEqual([{ environment: 'default', name: 'stripe_key', updatedAt: expect.any(String) }])
    expect(list.body).not.toContain('sk_live_123')
    expect(list.headers['cache-control']).toBe('no-store')

    const revealed = await call(app, 'GET', '/secrets/default/stripe_key')
    expect(revealed.json()).toEqual({ value: 'sk_live_123' })
    expect(revealed.headers['cache-control']).toBe('no-store')

    expect((await call(app, 'GET', '/secrets/default/nao_existe')).statusCode).toBe(404)

    await call(app, 'POST', '/vault/lock')
    const locked = await call(app, 'GET', '/secrets/default/stripe_key')
    expect(locked.statusCode).toBe(423)
    expect(locked.body).not.toContain('sk_live_123')
    expect((await call(app, 'PUT', '/secrets/default/x', { value: 'y' })).statusCode).toBe(423)

    expect((await call(app, 'DELETE', '/secrets/default/stripe_key')).statusCode).toBe(204)
    expect((await call(app, 'GET', '/secrets')).json()).toEqual([])
  })

  it('recusa valor que não é texto', async () => {
    const app = appWith()
    await created(app)
    expect((await call(app, 'PUT', '/secrets/default/x', { value: 42 })).statusCode).toBe(400)
  })

  it('nenhum byte do arquivo, do WAL ou do que sobrou de uma troca tem o valor em texto puro', async () => {
    dir = await mkdtemp(join(tmpdir(), 'dailly-cofre-'))
    const db = openDatabase(join(dir, 'dailly.sqlite'))
    const app = appWith(db)
    await created(app)

    await call(app, 'PUT', '/secrets/default/stripe_key', { value: 'sk_live_valor_antigo' })
    await call(app, 'PUT', '/secrets/default/stripe_key', { value: 'sk_live_valor_novo' })
    db.pragma('wal_checkpoint(PASSIVE)')

    for (const file of await readdir(dir)) {
      const bytes = await readFile(join(dir, file))
      expect(bytes.includes('sk_live_valor_antigo'), file).toBe(false)
      expect(bytes.includes('sk_live_valor_novo'), file).toBe(false)
    }
    db.close()
  })
})

describe('gate (nit): o nome do segredo tem que poder ser usado como {{nome}}', () => {
  it('recusa nome vazio, com espaço ou com chaves, e ambiente fora do padrão', async () => {
    const app = appWith()
    await created(app)
    for (const url of ['/secrets/default/', '/secrets/default/com%20espaco', '/secrets/default/a%7Db', '/secrets/a%3Ab/c']) {
      const response = await call(app, 'PUT', url, { value: 'x' })
      expect([400, 404], url).toContain(response.statusCode)
    }
    expect((await call(app, 'GET', '/secrets')).json()).toEqual([])
  })
})

describe('gate 4 (major): C3 pelas rotas', () => {
  it('sem DAILLY_SECRET_KEY, destrancar com senha recusa dizendo o motivo', async () => {
    const response = await call(appWith(openDatabase(':memory:'), null), 'POST', '/vault/unlock', {
      password: 'uma senha longa',
    })
    expect(response.statusCode).toBe(412)
    expect(response.json().error).toMatch(/DAILLY_SECRET_KEY/)
  })
})
