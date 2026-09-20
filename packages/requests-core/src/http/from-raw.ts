import type { Imported } from '../protocol.js'
import { toBase64 } from './base64.js'
import type { HttpHeader, HttpSpec } from './spec.js'
import { tokenize } from './tokenize.js'

export class NotACurlError extends Error {
  override readonly name = 'NotACurlError'
  constructor() {
    super('o texto não começa com `curl` — cole o comando inteiro, como o DevTools copia')
  }
}

export class AmbiguousUrlError extends Error {
  override readonly name = 'AmbiguousUrlError'
  constructor(candidates: readonly string[]) {
    super(
      `não dá para saber qual é a URL: sobraram ${candidates.length} tokens soltos ` +
        `(${candidates.join(', ')}). ` +
        'Isso costuma ser uma opção que este importador não conhece levando um valor junto.',
    )
  }
}

/**
 * Opções que **consomem o próximo token**, e por que a lista existe.
 *
 * Sem ela, `--cert cliente.pem` deixaria `cliente.pem` solto, e o token solto
 * vira a URL — a request apontaria para um arquivo e *pareceria* ter
 * funcionado. Reconhecer que a opção leva valor é o que permite ignorá-la
 * inteira, valor incluído, e relatá-la assim.
 *
 * A lista cobre o que curl de verdade traz. O que ela não cobrir cai na guarda
 * do token solto, logo abaixo — que recusa em vez de escolher.
 */
const IGNORED_WITH_VALUE = new Set([
  '--cert',
  '--key',
  '--cacert',
  '--proxy',
  '--connect-timeout',
  '--max-time',
  '-m',
  '--resolve',
  '--retry',
  '-A',
  '--user-agent',
  '-e',
  '--referer',
])

/**
 * Interpreta as palavras de um comando curl como uma request HTTP.
 *
 * Separado do `tokenize` de propósito: quebrar texto em palavras respeitando
 * aspas e decidir o que cada palavra significa são dois trabalhos, e juntá-los
 * é o que transforma um parser de curl numa regex ilegível.
 */
export function fromRaw(raw: string): Imported<HttpSpec> {
  const tokens = tokenize(raw)
  if (tokens[0] !== 'curl') throw new NotACurlError()

  let method: string | null = null
  const headers: HttpHeader[] = []
  let body: string | null = null
  const loose: string[] = []
  const ignored: string[] = []

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]!

    if (token === '-X' || token === '--request') {
      method = tokens[++i] ?? ''
      continue
    }

    if (token === '-d' || token === '--data' || token === '--data-raw') {
      body = tokens[++i] ?? ''
      continue
    }

    if (token === '-H' || token === '--header') {
      const header = tokens[++i] ?? ''
      const at = header.indexOf(':')
      if (at > 0) {
        headers.push({ name: header.slice(0, at).trim(), value: header.slice(at + 1).trim() })
      }
      continue
    }

    if (token === '-u' || token === '--user') {
      // O curl materializa isto em `Authorization: Basic`, e é o que sai na
      // fita. Guardar `user`/`pass` separados daria uma UI melhor para editar
      // credencial — fica anotado como decisão da UI, não deste pacote.
      headers.push({ name: 'Authorization', value: `Basic ${toBase64(tokens[++i] ?? '')}` })
      continue
    }

    if (IGNORED_WITH_VALUE.has(token)) {
      ignored.push(`${token} ${tokens[++i] ?? ''}`.trimEnd())
      continue
    }

    if (token.startsWith('-')) {
      ignored.push(token)
      continue
    }

    loose.push(token)
  }

  // Um token solto é a URL. Dois é sinal de que alguma opção desconhecida levou
  // um valor junto, e escolher entre eles seria inventar.
  if (loose.length > 1) throw new AmbiguousUrlError(loose)

  return {
    spec: {
      // A regra é do curl, não nossa: `-d` sem `-X` manda POST. Quem cola um
      // `-d` espera o mesmo verbo que o terminal usaria.
      method: method ?? (body === null ? 'GET' : 'POST'),
      url: loose[0] ?? '',
      headers,
      body,
    },
    ignored,
  }
}
