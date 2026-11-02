import type { HttpAuth, HttpHeader, HttpSpec } from './spec.js'
import { placeholdersOf } from '../interpolate.js'
import { hasPlaceholder } from '../placeholder.js'
import type { Folder } from '../storage/folder.js'
import type { SavedRequest } from '../storage/request-store.js'

/**
 * @file De uma coleção Postman v2.x (o export do Apidog) para pastas e requests.
 *
 * O formato Postman só existe dentro deste arquivo: quem chama recebe `Folder`
 * e `SavedRequest`, as palavras do dailly. É o Adapter na borda — o dia em que
 * vier outro formato, ele é outro arquivo ao lado deste, e nada que grava muda.
 *
 * **Nenhum valor de segredo sai daqui** (ADR 0013). As variáveis da coleção são
 * lidas só pelo nome; uma credencial escrita direto num header de autenticação
 * ou no `auth` vira `{{variável}}`, e o relatório diz qual, para ela ir para o
 * cofre em vez de para o SQLite em texto puro.
 */

export class NotAPostmanCollectionError extends Error {
  override readonly name = 'NotAPostmanCollectionError'
  constructor() {
    super(
      'o arquivo não é uma coleção Postman v2.x: esperava `info` e uma lista `item`. ' +
        'No Apidog, exporte o projeto no formato Postman (Collection v2.1).',
    )
  }
}

export interface Skipped {
  /** Onde estava, pastas e nome: `Upload / arquivo`. */
  readonly path: string
  readonly reason: string
}

export interface LiteralSecret {
  readonly path: string
  /** O header ou o tipo de auth que trazia o valor escrito direto. */
  readonly field: string
  /** O `{{nome}}` que ficou no lugar — é este nome que vai para o cofre. */
  readonly variable: string
}

export interface PostmanImport {
  /** Pai sempre antes do filho: é a ordem em que dá para gravar. */
  readonly folders: readonly Folder[]
  readonly requests: readonly SavedRequest[]
  /** Os nomes de variável usados ou declarados, sem valor, em ordem. */
  readonly variables: readonly string[]
  readonly literalSecrets: readonly LiteralSecret[]
  readonly skipped: readonly Skipped[]
}

/** Headers cujo valor é credencial. Escrito direto, ele não pode ir para o banco. */
const CREDENTIAL_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'api-key',
  'apikey',
  'x-auth-token',
  'x-access-token',
  'token',
  'cookie',
  'proxy-authorization',
])

type Json = Record<string, unknown>

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

const list = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isRecord) : [])


const slug = (...parts: string[]) =>
  parts
    .join('_')
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '')

const urlOf = (url: unknown): string => {
  if (typeof url === 'string') return url
  if (!isRecord(url)) return ''
  if (typeof url['raw'] === 'string') return url['raw']
  const host = Array.isArray(url['host']) ? url['host'].join('.') : str(url['host'])
  const path = Array.isArray(url['path']) ? url['path'].join('/') : str(url['path'])
  const protocol = str(url['protocol'])
  return `${protocol ? `${protocol}://` : ''}${host}${path ? `/${path}` : ''}`
}

/** `key` → `value` de um array `[{ key, value }]`, que é como o Postman guarda auth. */
const pairs = (value: unknown): Map<string, string> =>
  new Map(list(value).map((pair) => [str(pair['key']), str(pair['value'])]))

const form = (body: Json): string =>
  list(body['urlencoded'])
    .filter((pair) => pair['disabled'] !== true)
    .map((pair) => new URLSearchParams([[str(pair['key']), str(pair['value'])]]).toString())
    .join('&')

/**
 * O auth que vale num nível: o próprio, ou o herdado do ancestral mais próximo.
 *
 * No Postman v2.1 uma request sem `auth` (ou com `type: inherit`) usa o da
 * pasta, e a pasta o da coleção. Ler só o da request fazia a coleção inteira
 * sair sem credencial e voltar 401, sem o relatório dizer por quê.
 */
const authOf = (own: unknown, inherited: Json | null): Json | null => {
  if (!isRecord(own) || str(own['type']) === 'inherit') return inherited
  return own
}

export function fromPostman(
  input: unknown,
  options: { readonly root: string; readonly nextId: () => string },
): PostmanImport {
  if (!isRecord(input) || !isRecord(input['info']) || !Array.isArray(input['item'])) {
    throw new NotAPostmanCollectionError()
  }

  const folders: Folder[] = []
  const requests: SavedRequest[] = []
  const literalSecrets: LiteralSecret[] = []
  const skipped: Skipped[] = []

  const root: Folder = { id: options.nextId(), parentId: null, name: options.root, position: 0 }
  folders.push(root)

  /**
   * Os nomes já dados, e a credencial de cada um — só em memória, nunca na saída.
   *
   * Dois valores diferentes nunca dividem um nome: com o mesmo nome, o cofre
   * guardaria um só, e uma das requests sairia com a credencial da outra. O
   * mesmo valor reaproveita o nome, que é o que o autor quer (uma chave, um
   * cadastro).
   */
  const named = new Map<string, string>()

  /** Uma credencial escrita direto vira `{{nome}}`, e fica anotada. */
  const hide = (value: string, trail: string[], field: string, suffix: string): string => {
    // A mesma regra de "isto é variável" que a interpolação usa, e não um
    // `includes('{{')`: um segredo gerado que contém `{{` continua segredo.
    if (value === '' || hasPlaceholder(value)) return value
    const base = slug(...trail, suffix) || slug('segredo', suffix)
    let variable = base
    for (let n = 2; named.has(variable) && named.get(variable) !== value; n++) variable = `${base}_${n}`
    if (!named.has(variable)) named.set(variable, value)
    literalSecrets.push({ path: trail.join(' / '), field, variable })
    return `{{${variable}}}`
  }

  const convert = (item: Json, trail: string[], inherited: Json | null): HttpSpec | Skipped => {
    const path = trail.join(' / ')
    const request = isRecord(item['request']) ? item['request'] : {}
    const url = urlOf(request['url'])
    if (/^wss?:\/\//i.test(url)) return { path, reason: 'WebSocket não é suportado' }

    const headers: HttpHeader[] = list(request['header'])
      .filter((header) => header['disabled'] !== true)
      .map((header) => {
        const name = str(header['key'])
        const value = str(header['value'])
        return {
          name,
          value: CREDENTIAL_HEADERS.has(name.toLowerCase()) ? hide(value, trail, name, name) : value,
        }
      })

    let body: string | null = null
    const rawBody = isRecord(request['body']) ? request['body'] : null
    switch (rawBody ? str(rawBody['mode']) : '') {
      case '':
      case 'none':
        break
      case 'raw':
        body = str(rawBody!['raw']) || null
        break
      case 'urlencoded':
        body = form(rawBody!)
        if (!headers.some((header) => header.name.toLowerCase() === 'content-type')) {
          headers.push({ name: 'Content-Type', value: 'application/x-www-form-urlencoded' })
        }
        break
      case 'formdata':
        return { path, reason: 'body form-data não é suportado' }
      case 'graphql':
        return { path, reason: 'body GraphQL não é suportado' }
      default:
        return { path, reason: `body "${str(rawBody!['mode'])}" não é suportado` }
    }

    let auth: HttpAuth | null = null
    const query: string[] = []
    const rawAuth = authOf(request['auth'], inherited)
    const type = rawAuth ? str(rawAuth['type']) : ''
    if (rawAuth && type === 'basic') {
      const basic = pairs(rawAuth['basic'])
      auth = {
        user: basic.get('username') ?? '',
        password: hide(basic.get('password') ?? '', trail, 'Basic', 'password'),
      }
    } else if (rawAuth && type === 'bearer') {
      const token = hide(pairs(rawAuth['bearer']).get('token') ?? '', trail, 'Bearer', 'token')
      headers.push({ name: 'Authorization', value: `Bearer ${token}` })
    } else if (rawAuth && type === 'apikey') {
      const apikey = pairs(rawAuth['apikey'])
      const name = apikey.get('key') ?? 'X-Api-Key'
      const value = hide(apikey.get('value') ?? '', trail, name, name)
      if (apikey.get('in') === 'query') query.push(`${name}=${value}`)
      else headers.push({ name, value })
    } else if (rawAuth && type !== '' && type !== 'noauth' && type !== 'inherit') {
      return { path, reason: `auth "${type}" não é suportado` }
    }

    return {
      method: (str(request['method']) || 'GET').toUpperCase(),
      url,
      headers,
      body,
      query,
      auth,
    }
  }

  const walk = (items: Json[], parent: Folder, trail: string[], inherited: Json | null) => {
    items.forEach((item, position) => {
      const name = str(item['name']) || '(sem nome)'
      if (Array.isArray(item['item'])) {
        const folder: Folder = { id: options.nextId(), parentId: parent.id, name, position }
        folders.push(folder)
        walk(list(item['item']), folder, [...trail, name], authOf(item['auth'], inherited))
        return
      }
      const spec = convert(item, [...trail, name], inherited)
      if ('reason' in spec) {
        skipped.push(spec)
        return
      }
      requests.push({ id: options.nextId(), name, protocol: 'http', spec, folderId: parent.id, position })
    })
  }

  walk(list(input['item']), root, [], authOf(input['auth'], null))

  const declared = list(input['variable']).map((variable) => str(variable['key']))
  const used = requests.flatMap((request) => placeholdersOf(request.spec))
  const variables = [...new Set([...declared, ...used].filter((name) => name !== ''))].sort()

  return { folders, requests, variables, literalSecrets, skipped }
}
