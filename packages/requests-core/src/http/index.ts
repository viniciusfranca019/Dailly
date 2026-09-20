import type { Invalid, ProtocolDriver } from '../protocol.js'
import { fromRaw } from './from-raw.js'
import type { HttpSpec } from './spec.js'
import type { HttpWire } from './wire.js'

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

  validate: (spec: unknown): { spec: HttpSpec } | { errors: Invalid[] } => {
    const errors: Invalid[] = []
    const candidate = spec as Partial<HttpSpec> | null

    if (candidate === null || typeof candidate !== 'object') {
      return { errors: [{ field: '', message: 'deve ser um objeto' }] }
    }
    if (typeof candidate.method !== 'string' || candidate.method.trim() === '') {
      errors.push({ field: 'method', message: 'é obrigatório' })
    }
    if (typeof candidate.url !== 'string' || candidate.url.trim() === '') {
      errors.push({ field: 'url', message: 'é obrigatória' })
    }
    if (!Array.isArray(candidate.headers)) {
      errors.push({ field: 'headers', message: 'deve ser uma lista de pares' })
    }

    return errors.length > 0 ? { errors } : { spec: candidate as HttpSpec }
  },

  toWire: (spec: HttpSpec): HttpWire => ({
    protocol: 'http',
    method: spec.method.toUpperCase(),
    url: spec.url,
    headers: spec.headers,
    body: spec.body,
  }),

  fromRaw,
} satisfies ProtocolDriver<HttpSpec, HttpWire>

export type { HttpSpec, HttpHeader } from './spec.js'
export type { HttpWire } from './wire.js'
export { NotACurlError, AmbiguousUrlError } from './from-raw.js'
export { UnterminatedQuoteError, tokenize } from './tokenize.js'
