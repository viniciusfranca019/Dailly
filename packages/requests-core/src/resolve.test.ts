import { describe, expect, it } from 'vitest'
import { type HttpWire, httpDriver } from './http/index.js'
import { ProtocolRegistry } from './registry.js'
import { InvalidSpecError, UnresolvedVariableError, resolve } from './resolve.js'

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
    auth: null,
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

describe('C4: nenhuma chave sobrevive, venha ela de onde vier', () => {
  it('recusa quando o valor de uma variável traz outra variável dentro', () => {
    // `{{baseUrl}}` = `{{scheme}}://{{host}}` é rotina nesta classe de
    // ferramenta. Uma passada só resolve a primeira camada e manda a segunda
    // para a rede — e o C4 diz "nunca sai `{{token}}` na fita", sem ressalva.
    //
    // A recusa não é recursão: resolver em cadeia exigiria detectar ciclo, e
    // o valor disso não está provado. Recusar é honesto e barato.
    const boom = () =>
      resolve(registry(), spec(), { host: '{{interno}}', token: 't' })

    expect(boom).toThrow(UnresolvedVariableError)
    expect(boom).toThrow(/interno/)
  })

  it('deixa passar chave incompleta, que não é chave', () => {
    // O limite da guarda, dito em vez de suposto: ela procura `{{nome}}`
    // inteiro. Um `{{` solto não é placeholder de ninguém e vai para a fita
    // como texto — que é o certo, e é o que permite mandar chaves literais
    // desde que não formem um nome.
    const wire = resolve<HttpWire>(registry(), spec(), { host: 'x.dev', token: '{{' })

    expect(wire.headers).toEqual([{ name: 'Authorization', value: 'Bearer {{' }])
  })

  it('não resolve nome herdado do prototype em vez de dizer que falta', () => {
    // `{{constructor}}` devolvia o código-fonte de `Object` e seguia adiante
    // como se tivesse resolvido. O comentário do `in` existia para tratar
    // string vazia como valor; `Object.hasOwn` mantém isso sem a cadeia.
    const boom = () =>
      resolve(registry(), spec({ url: 'https://api/{{constructor}}' }), { host: 'x', token: 't' })

    expect(boom).toThrow(UnresolvedVariableError)
    expect(boom).toThrow(/constructor/)
  })
})

describe('C4: um spec inválido falha com classe própria, não com Error solto', () => {
  it('carrega os campos inválidos em vez de achatá-los em prosa', () => {
    // Quem chama precisa distinguir "o spec está errado" (400, destacar o
    // campo) de "algo quebrou" (500). Um `Error` sem tipo não permite isso, e
    // os pares campo/mensagem que o driver montou eram jogados fora.
    let caught: unknown
    try {
      resolve(
        registry(),
        { ...spec(), spec: { method: '', url: '', headers: 'nao', body: 1, auth: null } },
        {},
      )
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(InvalidSpecError)
    expect((caught as InvalidSpecError).errors.map((e) => e.field).sort()).toEqual([
      'body',
      'headers',
      'method',
      'url',
    ])
  })

  it('recusa header cuja forma não é par de textos, que chega do banco como JSON', () => {
    const invalid = { ...spec(), spec: { ...spec().spec, headers: [1, 'nao', null] } }

    expect(() => resolve(registry(), invalid, { host: 'x', token: 't' })).toThrow(InvalidSpecError)
  })
})

describe('C4: a recusa diz o que de fato aconteceu', () => {
  it('não acusa de ausente uma variável que está no ambiente', () => {
    // `{{base}}` = `https://{{host}}` e `host` definido: a antiga mensagem
    // dizia "a variável host não tem valor no ambiente". A pessoa vai
    // acrescentar `host`, já está lá, e não sobra nada para tentar.
    const boom = () =>
      resolve(registry(), spec({ url: '{{base}}/a' }), {
        base: 'https://{{host}}',
        host: 'x.dev',
        token: 't',
      })

    expect(boom).toThrow(UnresolvedVariableError)
    expect(boom).not.toThrow(/não tem valor no ambiente/)
    expect(boom).toThrow(/não resolve outra/)
  })

  it('separa as duas causas quando as duas acontecem', () => {
    let caught: UnresolvedVariableError | undefined
    try {
      resolve(registry(), spec({ url: '{{base}}/{{sumida}}' }), {
        base: 'https://{{host}}',
        host: 'x.dev',
        token: 't',
      })
    } catch (error) {
      caught = error as UnresolvedVariableError
    }

    expect(caught?.missing).toEqual(['sumida'])
    expect(caught?.surviving).toEqual(['host'])
  })

  it('a ausência simples continua dizendo o que sempre disse', () => {
    expect(() => resolve(registry(), spec(), { host: 'x.dev' })).toThrow(
      /token não tem valor no ambiente/,
    )
  })
})
