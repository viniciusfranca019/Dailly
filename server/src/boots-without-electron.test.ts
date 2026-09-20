import { uuidIds } from '@dailly/domain'
import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type RunningServer } from './index.js'
import { InvalidTimeZoneError } from './shell/config.js'

/**
 * The rule ADR 0009 made executable, and the reason it is a test and not a
 * paragraph:
 *
 *   "`server/` tem um teste de integração que sobe o Fastify **sem Electron**,
 *    bate num endpoint e derruba."
 *
 * ADR 0008 kept HTTP between `ui/` and `server/` instead of collapsing to IPC,
 * and paid a real price for it — a port on the user's machine, a lifecycle, a
 * class of error that did not exist. This test is what that price buys. While
 * it can be written, the separation is a fact. The day it cannot, HTTP has
 * stopped paying for itself and collapsing to IPC is a conclusion rather than a
 * debate.
 *
 * So: a real socket, a real `fetch`, no Electron anywhere.
 */
describe('the server boots without Electron', () => {
  let server: RunningServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  it('listens on an ephemeral loopback port and answers', async () => {
    server = await createServer({ databaseFile: ':memory:' })

    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    // Port 0 asks the OS for a free one; anything else means we hardcoded it.
    expect(server.config.port).toBe(0)

    const response = await fetch(`${server.url}/health`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok', zone: 'UTC' })
  })

  it('takes an entry over the wire and gives it back on the next request', async () => {
    server = await createServer({ databaseFile: ':memory:' })
    const at = '2026-07-24T10:00:00.000Z'
    const entry = {
      id: uuidIds.next(),
      body: '# título\n- um',
      occurredAt: at,
      createdAt: at,
      updatedAt: at,
      labelIds: [],
      props: {},
    }

    const posted = await fetch(`${server.url}/entries`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(entry),
    })
    expect(posted.status).toBe(201)

    const listed = await fetch(`${server.url}/entries`)

    expect(await listed.json()).toEqual([entry])
  })

  it('enforces the token over a real socket', async () => {
    server = await createServer({ databaseFile: ':memory:', token: 'segredo-da-execucao' })

    expect((await fetch(`${server.url}/entries`)).status).toBe(401)
    expect(
      (
        await fetch(`${server.url}/entries`, {
          headers: { authorization: 'Bearer segredo-da-execucao' },
        })
      ).status,
    ).toBe(200)
  })

  it('refuses to boot with a zone the platform does not know', async () => {
    // Fail at boot with a message, not on the first entry someone writes.
    await expect(createServer({ databaseFile: ':memory:', zone: 'Mars/Olympus' })).rejects.toThrow(
      InvalidTimeZoneError,
    )
  })

  it('releases the port when it closes', async () => {
    const first = await createServer({ databaseFile: ':memory:' })
    const url = first.url
    await first.close()

    // Nothing should answer there any more. If the close left the socket open,
    // the desktop shell would leak a listener per restart.
    await expect(fetch(`${url}/health`)).rejects.toThrow()
  })
})
