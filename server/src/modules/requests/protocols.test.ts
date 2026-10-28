import type { SavedRequest } from '@dailly/requests-core'
import { inMemoryRequestStore } from '@dailly/requests-core/testing'
import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { type Protocol, http } from './protocols.js'
import { registerRequestRoutes } from './routes.js'

/**
 * Um protocolo que existe só aqui, para provar a costura da ADR 0011.
 *
 * gRPC e AMQP entram como um `Protocol` a mais, com as duas metades juntas: o
 * driver puro do `requests-core` e o executor deste servidor. O teste é o
 * gRPC de mentira: se ele executa sem que as rotas mudem, o de verdade também.
 */
interface EchoSpec {
  readonly text: string
}
interface EchoWire {
  readonly protocol: 'echo'
  readonly text: string
}

const echo: Protocol<EchoSpec, EchoWire> = {
  driver: {
    protocol: 'echo',
    validate: (spec) => {
      const text = (spec as { text?: unknown } | null)?.text
      return typeof text === 'string'
        ? { spec: { text } }
        : { errors: [{ field: 'text', message: 'é obrigatório' }] }
    },
    toWire: (spec) => ({ protocol: 'echo', text: spec.text }),
  },
  execute: async (wire) => ({ eco: wire.text }),
}

const saved = (protocol: string, spec: Record<string, unknown>): SavedRequest => ({
  id: 'r-1',
  name: 'r',
  protocol,
  spec,
  folderId: null,
  position: 0,
})

const appWith = async (protocols: readonly Protocol[], request: SavedRequest) => {
  const store = inMemoryRequestStore()
  await store.saveRequest(request)
  const app = Fastify()
  registerRequestRoutes(app, store, protocols)
  return app
}

const execute = (app: Awaited<ReturnType<typeof appWith>>, env: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: '/requests/r-1/execute', payload: { env } })

describe('um protocolo novo entra sem tocar nas rotas', () => {
  it('executa pelo próprio executor, com as variáveis já resolvidas', async () => {
    const app = await appWith([http, echo], saved('echo', { text: 'oi {{nome}}' }))

    const response = await execute(app, { nome: 'Vini' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ eco: 'oi Vini' })
  })

  it('o spec inválido do protocolo novo é 422, pelo driver dele', async () => {
    const app = await appWith([http, echo], saved('echo', { outro: 1 }))

    const response = await execute(app)

    expect(response.statusCode).toBe(422)
  })

  it('um protocolo que o servidor não registrou é 422 nomeando-o', async () => {
    const app = await appWith([http], saved('echo', { text: 'oi' }))

    const response = await execute(app)

    expect(response.statusCode).toBe(422)
    expect(response.json().error).toMatch(/echo/)
  })
})
