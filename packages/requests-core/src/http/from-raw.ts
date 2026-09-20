import type { Imported } from '../protocol.js'
import { hasPlaceholder, indexOutsidePlaceholder } from './placeholders.js'
import type { HttpAuth, HttpHeader, HttpSpec } from './spec.js'
import { tokenize } from './tokenize.js'

export class NotACurlError extends Error {
  override readonly name = 'NotACurlError'
  constructor() {
    super('o texto não começa com `curl` — cole o comando inteiro, como o DevTools copia')
  }
}

export class MissingUrlError extends Error {
  override readonly name = 'MissingUrlError'
  constructor() {
    super('o comando não tem URL — sem ela não há requisição para montar')
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
 * Corpo cru, e a diferença entre as grafias que importa.
 *
 * `-d`, `--data`, `--data-ascii` e `--data-binary` **leem arquivo** quando o
 * valor começa com `@`; `--data-raw` existe justamente para não ler. Deste
 * lado da fronteira não há arquivo nenhum, então a forma de arquivo é relatada
 * — mandar `@corpo.json` como texto é a única saída que nem funciona nem
 * avisa, e o pacote já relata o equivalente no `--data-urlencode` e no `-b`.
 */
const BODY_FLAGS = new Set(['-d', '--data', '--data-binary', '--data-ascii', '--data-raw'])
const BODY_FLAGS_READING_FILES = new Set(['-d', '--data', '--data-binary', '--data-ascii'])

/**
 * Opções que **consomem o próximo token** e que este importador não aplica.
 *
 * Sem a lista, `--cert cliente.pem` deixaria `cliente.pem` solto, e token solto
 * vira URL — a request apontaria para um arquivo e *pareceria* ter funcionado.
 * Reconhecer que a opção leva valor é o que permite ignorá-la inteira, valor
 * incluído, e relatá-la assim.
 *
 * `-F` está aqui porque multipart não cabe num corpo de texto: relatar é
 * honesto, e derrubar o comando inteiro por causa disso não é.
 *
 * O que a lista não cobrir cai na guarda do token solto — que recusa em vez de
 * escolher.
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
  '-F',
  '--form',
  '-o',
  '--output',
  '-w',
  '--write-out',
])

/**
 * A codificação do `--data-urlencode`, seguindo a regra do curl e não a minha.
 *
 * **O primeiro `=` vence, e o `@` só é a forma de arquivo quando nenhum `=`
 * vem antes dele.** Verificado contra curl de verdade: `email=a@b.com` manda
 * `email=a%40b.com`. Tratar qualquer `@` como arquivo descartava o corpo de um
 * comando perfeitamente legítimo.
 *
 * `null` significa "não dá para aplicar", e quem chama relata — arquivo não
 * existe deste lado da fronteira, e chave dentro do valor não pode ser
 * codificada sem sumir com a chave.
 */
function urlEncoded(argument: string): string | null {
  // Codificar uma chave a transformaria em `%7B%7Bterm%7D%7D`, e aí nem o
  // `resolve` nem a varredura de sobreviventes a reconheceriam.
  if (hasPlaceholder(argument)) return null

  const at = argument.indexOf('=')
  if (at < 0) return argument.includes('@') ? null : encodeURIComponent(argument)

  const name = argument.slice(0, at)
  const content = encodeURIComponent(argument.slice(at + 1))
  return name === '' ? content : `${name}=${content}`
}

/**
 * Interpreta as palavras de um comando curl como uma request HTTP.
 *
 * Separado do `tokenize` de propósito: quebrar texto em palavras respeitando
 * aspas e decidir o que cada palavra significa são dois trabalhos, e juntá-los
 * é o que transforma um parser de curl numa regex ilegível.
 */
export function fromRaw(raw: string): Imported<HttpSpec> {
  const tokens = tokenize(raw)
  // `curl.exe` é o que o histórico de um terminal do Windows devolve.
  if (tokens[0] !== 'curl' && tokens[0] !== 'curl.exe') throw new NotACurlError()

  let method: string | null = null
  const headers: HttpHeader[] = []
  const data: string[] = []
  let auth: HttpAuth | null = null
  const loose: string[] = []
  const ignored: string[] = []

  const nextOf = (index: number) => tokens[index] ?? ''

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]!

    if (token === '-X' || token === '--request') {
      method = nextOf(++i)
      continue
    }

    if (BODY_FLAGS.has(token)) {
      const argument = nextOf(++i)
      // Só o `@` inicial marca arquivo: `-d 'email=a@b.com'` é corpo comum.
      if (BODY_FLAGS_READING_FILES.has(token) && argument.startsWith('@')) {
        ignored.push(`${token} ${argument}`)
        continue
      }
      // Repetido, o curl junta com `&` — `-d a=1 -d b=2` manda `a=1&b=2`.
      // Ficar com o último perderia metade do corpo em silêncio, e o C1 já
      // decidiu, para o `-H`, que repetição é legítima e se preserva.
      data.push(argument)
      continue
    }

    if (token === '--data-urlencode') {
      const argument = nextOf(++i)
      const encoded = urlEncoded(argument)
      if (encoded === null) ignored.push(`${token} ${argument}`)
      else data.push(encoded)
      continue
    }

    if (token === '-H' || token === '--header') {
      const header = nextOf(++i)
      const at = header.indexOf(':')
      // `-H 'X-Foo'` é erro de digitação plausível. Sumir com ele seria
      // exatamente o silêncio que o C6 proíbe.
      if (at > 0) headers.push({ name: header.slice(0, at).trim(), value: header.slice(at + 1).trim() })
      else ignored.push(`${token} ${header}`.trimEnd())
      continue
    }

    if (token === '-b' || token === '--cookie') {
      const argument = nextOf(++i)
      // Com `=` é cookie; sem, é arquivo de cookies, e arquivo não existe deste
      // lado. A ADR 0011 apoia a decisão inteira de executar no servidor em
      // `Cookie` ser metade do uso real — recusar a flag que o carrega seria
      // irônico.
      if (indexOutsidePlaceholder(argument, '=') >= 0) {
        headers.push({ name: 'Cookie', value: argument })
      }
      else ignored.push(`${token} ${argument}`.trimEnd())
      continue
    }

    if (token === '-u' || token === '--user') {
      const credential = nextOf(++i)
      // Só o primeiro dois-pontos separa (`-u u:a:b` é senha `a:b`), e só um
      // que esteja **fora** de uma chave: em `-u '{{cred}}'` não há corte a
      // fazer, e inventá-lo mandaria `u:p:` para a fita.
      const at = indexOutsidePlaceholder(credential, ':')
      auth =
        at < 0
          ? { user: credential, password: null }
          : { user: credential.slice(0, at), password: credential.slice(at + 1) }
      continue
    }

    if (IGNORED_WITH_VALUE.has(token)) {
      ignored.push(`${token} ${nextOf(++i)}`.trimEnd())
      continue
    }

    if (token.startsWith('-')) {
      ignored.push(token)
      continue
    }

    loose.push(token)
  }

  // Um token solto é a URL. Dois é sinal de que alguma opção desconhecida levou
  // um valor junto, e escolher entre eles seria inventar. Zero é uma request
  // oca — e request oca é pior que erro, porque parece ter funcionado.
  if (loose.length > 1) throw new AmbiguousUrlError(loose)
  if (loose.length === 0) throw new MissingUrlError()

  const body = data.length === 0 ? null : data.join('&')

  return {
    spec: {
      // A regra é do curl, não nossa: `-d` sem `-X` manda POST. Quem cola um
      // `-d` espera o mesmo verbo que o terminal usaria.
      method: method ?? (body === null ? 'GET' : 'POST'),
      url: loose[0]!,
      headers,
      body,
      auth,
    },
    ignored,
  }
}
