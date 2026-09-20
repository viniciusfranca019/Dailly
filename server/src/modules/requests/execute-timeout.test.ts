import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ExecutionTimeoutError, executeHttp } from './execute.js'

/**
 * O prazo, com o relógio encurtado.
 *
 * `executeHttp` aceita `timeoutMs` para que isto seja testável: o padrão de 30
 * segundos é o certo em produção e impossível numa suíte. Sem esse parâmetro o
 * caminho do prazo — que é justamente o que o conserto do teto criou — ficaria
 * sem prova nenhuma.
 */
let target: FastifyInstance
let url: string

beforeEach(async () => {
  target = Fastify({ logger: false })
  target.get('/devagar', async (_request, reply) => {
    // Nunca responde dentro do prazo do teste.
    await new Promise((done) => setTimeout(done, 5_000))
    return reply.send('tarde demais')
  })
  target.get('/goteja', async (_request, reply) => {
    reply.raw.writeHead(200, { 'content-type': 'text/plain' })
    reply.raw.write('começo')
    // Deixa a conexão aberta sem terminar: é o alvo que segura o processo.
    return reply
  })
  await target.listen({ host: '127.0.0.1', port: 0 })
  url = `http://127.0.0.1:${(target.server.address() as { port: number }).port}`
})

afterEach(async () => {
  await target.close()
})

const wire = (path: string) => ({
  protocol: 'http' as const,
  method: 'GET',
  url: `${url}${path}`,
  headers: [],
  body: null,
})

describe('o prazo é de parede, não de ociosidade', () => {
  it('erro próprio quando estoura no aperto de mão — não há parcial a devolver', async () => {
    await expect(executeHttp(wire('/devagar'), { timeoutMs: 100 })).rejects.toThrow(
      ExecutionTimeoutError,
    )
  })

  it('devolve o parcial marcado quando estoura durante o corpo', async () => {
    // Era o buraco que o conserto do teto abriu: o `AbortSignal` dispara
    // dentro do laço do corpo, e o laço não tinha `catch`.
    const response = await executeHttp(wire('/goteja'), { timeoutMs: 300 })

    expect(response.timedOut).toBe(true)
    expect(response.body).toBe('começo')
    expect(response.status).toBe(200)
  })

})
