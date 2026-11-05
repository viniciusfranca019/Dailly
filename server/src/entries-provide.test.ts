import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { uuidIds } from '@dailly/domain'
import { UTC } from '@dailly/periods'
import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type RunningServer } from './index.js'
import { MODULES } from './modules.js'
import { buildApp } from './shell/app.js'
import { openDatabase } from './shell/database.js'

/**
 * Card #29: the Daily Log under the Modules convention.
 *
 * The entries repository used to be built by the composition root and handed
 * to every module in the shared bag. Now the entries module builds it in its
 * own `provide`, like every other module, and a test that needs a different
 * repository mounts the routes over it: that is C3, in
 * `modules/entries/routes.test.ts`.
 */
const anEntry = () => {
  const at = '2026-07-24T10:00:00.000Z'
  return { id: uuidIds.next(), body: 'gravado pelo módulo', occurredAt: at, createdAt: at, updatedAt: at, labelIds: [], props: {} }
}

describe('C2: the entries repository is born in the module provide', () => {
  it('writes to the SQLite file of the app, with no repository handed in', async () => {
    const db = openDatabase(':memory:')
    const app = buildApp({ db, zone: UTC })

    const response = await app.inject({ method: 'POST', url: '/entries', payload: anEntry() })

    expect(response.statusCode).toBe(201)
    expect(db.prepare('SELECT body FROM entries').all()).toEqual([{ body: 'gravado pelo módulo' }])
  })
})

describe('C4: a manifest without the entries module boots', () => {
  let server: RunningServer | undefined
  let dir: string | undefined
  afterEach(async () => {
    await server?.close()
    server = undefined
    if (dir) await rm(dir, { recursive: true, force: true })
    dir = undefined
  })

  it('serves with only Requests in the manifest', async () => {
    dir = await mkdtemp(join(tmpdir(), 'dailly-c4-'))
    server = await createServer({ databaseFile: join(dir, 'dailly.sqlite') }, MODULES.filter((module) => module.id === 'requests'))

    const response = await fetch(`${server.url}/health`)

    expect(response.status).toBe(200)
  })
})
