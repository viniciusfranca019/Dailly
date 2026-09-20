import type { Invalid, ProtocolDriver } from '../protocol.js'
import { toBase64 } from './base64.js'
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
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isHeader = (value: unknown): boolean =>
  isRecord(value) && typeof value['name'] === 'string' && typeof value['value'] === 'string'

const isAuth = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value['user'] === 'string' &&
  (value['password'] === null || typeof value['password'] === 'string')

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
    } else if (!candidate.headers.every(isHeader)) {
      errors.push({ field: 'headers', message: 'cada item deve ter nome e valor de texto' })
    }

    if (candidate.body !== null && typeof candidate.body !== 'string') {
      errors.push({ field: 'body', message: 'deve ser texto ou nulo' })
    }

    if (candidate.auth !== null && !isAuth(candidate.auth)) {
      errors.push({ field: 'auth', message: 'deve ser nulo ou ter usuário e senha de texto' })
    }

    return errors.length > 0 ? { errors } : { spec: candidate as HttpSpec }
  },

  toWire: (spec: HttpSpec): HttpWire => ({
    protocol: 'http',
    method: spec.method.toUpperCase(),
    url: spec.url,
    // O `Basic` é fechado **aqui**, e não na importação, porque só aqui a
    // credencial já passou pela interpolação. Ela entra no fim da lista: a
    // ordem relativa a um header explícito não é observável na fita, e um
    // lugar fixo é o que torna o resultado determinístico.
    headers:
      spec.auth === null
        ? spec.headers
        : [
            ...spec.headers,
            {
              name: 'Authorization',
              // Sem senha separada, a credencial inteira já é o par — foi o
              // que atravessou a interpolação sem ser cortada.
              value: `Basic ${toBase64(
                spec.auth.password === null
                  ? spec.auth.user
                  : `${spec.auth.user}:${spec.auth.password}`,
              )}`,
            },
          ],
    body: spec.body,
  }),

  fromRaw,
} satisfies ProtocolDriver<HttpSpec, HttpWire>

export type { HttpSpec, HttpHeader, HttpAuth } from './spec.js'
export type { HttpWire } from './wire.js'
export { NotACurlError, AmbiguousUrlError, MissingUrlError } from './from-raw.js'
export { UnterminatedQuoteError, tokenize } from './tokenize.js'
