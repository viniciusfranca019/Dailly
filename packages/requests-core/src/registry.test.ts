import { describe, expect, it } from 'vitest'
import type { ProtocolDriver, WireRequest } from './protocol.js'
import { ProtocolRegistry, UnknownProtocolError } from './registry.js'
import { resolve } from './resolve.js'

/**
 * C5 — um protocolo novo entra pelo registry sem o modelo saber o nome dele.
 *
 * O driver aqui é escrito à mão e é **inventado de propósito**: se o único
 * protocolo que o teste exercita fosse o HTTP, ele provaria que o HTTP
 * funciona, não que o ponto de extensão existe. Um protocolo que o pacote
 * nunca ouviu falar é a única prova de que acrescentar um caso é um arquivo
 * novo e não uma edição no núcleo.
 */
interface AmqpSpec {
  readonly exchange: string
  readonly routingKey: string
  readonly message: string
}

interface AmqpWire extends WireRequest {
  readonly protocol: 'amqp'
  readonly target: string
  readonly payload: string
}

const amqpDriver = {
  protocol: 'amqp',
  validate: (spec: unknown) => {
    const candidate = spec as Partial<AmqpSpec>
    return typeof candidate?.exchange === 'string'
      ? { spec: candidate as AmqpSpec }
      : { errors: [{ field: 'exchange', message: 'é obrigatório' }] }
  },
  toWire: (spec: AmqpSpec): AmqpWire => ({
    protocol: 'amqp',
    target: `${spec.exchange}/${spec.routingKey}`,
    payload: spec.message,
  }),
  // Sem `fromRaw`: AMQP não tem texto que alguém cola, e é por isso que o
  // contrato declara essa metade como opcional.
} satisfies ProtocolDriver<AmqpSpec, AmqpWire>

const amqpRequest = {
  id: 'r-9',
  name: 'publicar',
  protocol: 'amqp',
  spec: { exchange: '{{ambiente}}.eventos', routingKey: 'entrada.criada', message: 'oi' },
}

describe('C5: um protocolo novo entra pelo registry', () => {
  it('resolve um protocolo que o pacote nunca ouviu falar', () => {
    const registry = new ProtocolRegistry().register(amqpDriver)

    const wire = resolve<AmqpWire>(registry, amqpRequest, { ambiente: 'prod' })

    expect(wire).toEqual({ protocol: 'amqp', target: 'prod.eventos/entrada.criada', payload: 'oi' })
  })

  it('a interpolação vale para ele sem que o driver faça nada', () => {
    // O driver do AMQP não tem uma linha sobre `{{}}`. Se a substituição
    // morasse no driver, cada protocolo novo teria que reimplementá-la.
    const registry = new ProtocolRegistry().register(amqpDriver)

    expect(resolve<AmqpWire>(registry, amqpRequest, { ambiente: 'dev' }).target).toBe(
      'dev.eventos/entrada.criada',
    )
  })

  it('a validação do driver é quem recusa o spec, não o núcleo', () => {
    const registry = new ProtocolRegistry().register(amqpDriver)

    expect(() => resolve(registry, { ...amqpRequest, spec: { nada: true } }, {})).toThrow(
      /exchange é obrigatório/,
    )
  })

  it('protocolo sem driver é recusado dizendo o que existe', () => {
    const registry = new ProtocolRegistry().register(amqpDriver)

    const boom = () => resolve(registry, { ...amqpRequest, protocol: 'carrier-pigeon' }, {})

    expect(boom).toThrow(UnknownProtocolError)
    expect(boom).toThrow(/carrier-pigeon/)
    expect(boom).toThrow(/amqp/)
  })
})
