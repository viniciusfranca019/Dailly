import type { ProtocolDriver } from '../protocol.js'
import { fromRaw } from './from-raw.js'
import type { HttpSpec } from './spec.js'

/**
 * O driver HTTP — hoje o único, e por isso o que prova que o registry serve.
 *
 * `satisfies` em vez de anotação: o contrato diz que `fromRaw` é **opcional**,
 * porque nem todo protocolo tem texto que alguém cola. Este tem, e anotar o
 * tipo apagaria isso — quem usasse o driver concreto teria que checar se a
 * função existe, num lugar onde ela existe. `satisfies` confere o contrato e
 * preserva o que este driver sabe de si.
 */
export const httpDriver = {
  protocol: 'http',
  validate: (spec: unknown) => ({ spec: spec as HttpSpec }),
  fromRaw,
} satisfies ProtocolDriver<HttpSpec>

export type { HttpSpec, HttpHeader } from './spec.js'
