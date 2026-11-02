import { hasPlaceholder } from '../placeholder.js'
import type { HttpAuth, HttpSpec } from './spec.js'

/**
 * Credenciais escritas direto num spec HTTP, e a troca delas por `{{nome}}`.
 *
 * Existe para o colar de curl (passo 10, ADR 0013): um curl do DevTools traz a
 * chave em claro, e gravá-lo como veio deixaria a chave no SQLite. Esta é a
 * metade pura — achar e trocar. Pedir a senha e gravar no cofre é da tela.
 *
 * A lista é dado, não comportamento: um header novo é uma linha aqui.
 */
const CREDENTIAL_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'x-api-key',
  'api-key',
  'apikey',
  'x-auth-token',
  'x-access-token',
  'token',
])

/** `X-Partner-Api-Key`, `X-Session-Token`: o sufixo diz o que o nome é. */
const CREDENTIAL_SUFFIX = /[-_](api[-_]?key|token|secret)$/i

/** `Bearer abc` → esquema e segredo. Só nos headers que levam esquema. */
const SCHEMED = new Set(['authorization', 'proxy-authorization'])
const SCHEME = /^([A-Za-z][\w-]*)\s+(\S.*)$/

export interface FoundCredential {
  /** A posição no spec: `header:<índice>` ou `auth`. É o que `hideCredentials` recebe de volta. */
  readonly id: string
  /** O que a tela mostra: o nome do header, ou `-u`. */
  readonly label: string
  /** `Bearer` em `Bearer abc`; `null` quando o valor inteiro é o segredo. */
  readonly scheme: string | null
  /** O segredo em si. Só em memória: vai para o cofre, nunca para o spec. */
  readonly value: string
  /** O nome sugerido, único por valor dentro deste spec. */
  readonly suggested: string
}

export interface CredentialChoice {
  readonly id: string
  readonly name: string
}

const slug = (...parts: string[]) =>
  parts
    .join('_')
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '')

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

const isCredentialHeader = (name: string) =>
  CREDENTIAL_HEADERS.has(name.toLowerCase()) || CREDENTIAL_SUFFIX.test(name)

const split = (name: string, value: string): { scheme: string | null; secret: string } => {
  const match = SCHEMED.has(name.toLowerCase()) ? SCHEME.exec(value) : null
  return match ? { scheme: match[1]!, secret: match[2]! } : { scheme: null, secret: value }
}

/**
 * Qual metade do `-u` é o segredo — uma regra só, que achar e trocar dividem.
 *
 * Com senha, é a senha: `-u ana:s3nha`. Sem senha (`-u tok`) ou com ela vazia
 * (`-u sk_live_123:`, o jeito que a doc do Stripe ensina), é o usuário. Com a
 * senha em `{{variável}}`, o usuário é só um nome e não há segredo literal.
 */
const authSecret = (auth: HttpAuth): { field: 'user' | 'password'; value: string } | null => {
  if (auth.password !== null && auth.password !== '') {
    return hasPlaceholder(auth.password) ? null : { field: 'password', value: auth.password }
  }
  return { field: 'user', value: auth.user }
}

/**
 * As credenciais literais do spec: headers primeiro, na ordem, depois o `-u`.
 *
 * Um valor que já tem `{{…}}` não é literal — é a forma protegida, e mexer nele
 * trocaria uma variável por outra.
 */
export function findCredentials(spec: HttpSpec): FoundCredential[] {
  const host = hostOf(spec.url)
  const named = new Map<string, string>()

  /** Dois valores diferentes nunca dividem um nome: o cofre guardaria um só. */
  const nameFor = (suffix: string, value: string): string => {
    const base = slug(host, suffix) || slug('segredo', suffix)
    let name = base
    for (let n = 2; named.has(name) && named.get(name) !== value; n++) name = `${base}_${n}`
    named.set(name, value)
    return name
  }

  const found: FoundCredential[] = []
  spec.headers.forEach((header, index) => {
    if (!isCredentialHeader(header.name) || header.value === '' || hasPlaceholder(header.value)) return
    const { scheme, secret } = split(header.name, header.value)
    found.push({
      id: `header:${index}`,
      label: header.name,
      scheme,
      value: secret,
      suggested: nameFor(header.name, secret),
    })
  })

  const auth = spec.auth
  if (auth !== null) {
    const secret = authSecret(auth)
    if (secret !== null && secret.value !== '' && !hasPlaceholder(secret.value)) {
      found.push(
        secret.field === 'password'
          ? { id: 'auth', label: '-u (senha)', scheme: null, value: secret.value, suggested: nameFor('senha', secret.value) }
          : { id: 'auth', label: '-u', scheme: null, value: secret.value, suggested: nameFor('token', secret.value) },
      )
    }
  }
  return found
}

/** O spec com cada credencial escolhida trocada por `{{nome}}`; o esquema fica. */
export function hideCredentials(spec: HttpSpec, choices: readonly CredentialChoice[]): HttpSpec {
  const names = new Map(choices.map((choice) => [choice.id, choice.name]))
  const placeholder = (name: string) => `{{${name}}}`

  const headers = spec.headers.map((header, index) => {
    const name = names.get(`header:${index}`)
    if (name === undefined) return header
    const { scheme } = split(header.name, header.value)
    return { name: header.name, value: scheme ? `${scheme} ${placeholder(name)}` : placeholder(name) }
  })

  const authName = names.get('auth')
  const secret = spec.auth === null ? null : authSecret(spec.auth)
  const auth =
    spec.auth === null || authName === undefined || secret === null
      ? spec.auth
      : secret.field === 'password'
        ? { ...spec.auth, password: placeholder(authName) }
        : { ...spec.auth, user: placeholder(authName) }

  return { ...spec, headers, auth }
}
