import { describe, expect, it } from 'vitest'
import { type HttpWire, httpDriver } from '@dailly/requests-core/http'
import { ProtocolRegistry } from './registry.js'
import { UnresolvedVariableError, resolve } from './resolve.js'

/**
 * C4 — o que vai na fita é literal, e variável não resolvida é recusada.
 *
 * Esta é a função que dá o preview sem hop nenhum: a ADR 0011 recusou o
 * híbrido "o servidor monta o estado e a UI executa" justamente porque a única
 * virtude dele — ver exatamente o que vai ser enviado — é isto aqui, puro, no
 * renderer.
 */
const registry = () => new ProtocolRegistry().register(httpDriver)

const spec = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'r-1',
  name: 'listar entradas',
  protocol: 'http',
  spec: {
    method: 'GET',
    url: 'https://{{host}}/entries',
    headers: [{ name: 'Authorization', value: 'Bearer {{token}}' }],
    body: null,
    ...over,
  },
})

describe('C4: o que vai na fita é literal', () => {
  it('substitui as variáveis na URL, nos headers e no corpo', () => {
    const wire = resolve<HttpWire>(registry(), spec({ body: '{"quem":"{{quem}}"}', method: 'POST' }), {
      host: 'api.exemplo.com',
      token: 'abc123',
      quem: 'vinicius',
    })

    expect(wire).toEqual({
      protocol: 'http',
      method: 'POST',
      url: 'https://api.exemplo.com/entries',
      headers: [{ name: 'Authorization', value: 'Bearer abc123' }],
      body: '{"quem":"vinicius"}',
    })
  })

  it('resolver duas vezes dá o mesmo — não há estado escondido', () => {
    const env = { host: 'x.dev', token: 't' }
    const request = spec()

    expect(resolve(registry(), request, env)).toEqual(resolve(registry(), request, env))
  })

  it('não sobra chave nenhuma por resolver no resultado', () => {
    // A asserção que vale: varrer o resultado inteiro atrás de `{{`. Checar
    // campo a campo deixaria um campo novo passar despercebido no dia em que
    // o schema crescer.
    const wire = resolve<HttpWire>(registry(), spec(), { host: 'x.dev', token: 't' })

    expect(JSON.stringify(wire)).not.toContain('{{')
  })
})

describe('C4: variável não resolvida é recusada nomeando qual', () => {
  it('falha em vez de mandar {{token}} literal para a rede', () => {
    // É o bug que todo cliente de API tem: a variável vazia vira texto e a
    // requisição sai com `Bearer {{token}}`. O servidor responde 401 e a pessoa
    // procura o erro na autenticação, não na variável.
    const boom = () => resolve(registry(), spec(), { host: 'x.dev' })

    expect(boom).toThrow(UnresolvedVariableError)
    expect(boom).toThrow(/token/)
  })

  it('nomeia todas as que faltam, não a primeira', () => {
    const boom = () => resolve(registry(), spec(), {})

    expect(boom).toThrow(/host/)
    expect(boom).toThrow(/token/)
  })

  it('variável que existe mas está vazia é valor, não ausência', () => {
    // String vazia é uma escolha de quem configurou o ambiente. Tratá-la como
    // ausente obrigaria a pessoa a inventar um valor para dizer "nenhum".
    const wire = resolve<HttpWire>(registry(), spec(), { host: 'x.dev', token: '' })

    expect(wire.headers).toEqual([{ name: 'Authorization', value: 'Bearer ' }])
  })
})
