import { describe, expect, it } from 'vitest'
import { ProtocolRegistry, UnresolvedVariableError, resolve } from '../index.js'
import { type HttpWire, httpDriver } from './index.js'

const importing = (raw: string) => httpDriver.fromRaw(raw)
const registry = () => new ProtocolRegistry().register(httpDriver)
const wireOf = (spec: unknown, env: Record<string, string>) =>
  resolve<HttpWire>(registry(), { id: 'r', name: 'n', protocol: 'http', spec }, env)

/**
 * A regra que o gate nomeou depois de achar o mesmo defeito duas vezes.
 *
 * O importador toma decisões sobre o **texto literal** dos valores: o
 * `--data-urlencode` codifica em volta do `=`, o `-u` corta no `:`, o `-b`
 * decide por `=`. Toda decisão dessas tomada sobre um `{{placeholder}}` é
 * tomada sobre o texto errado — e o resultado é uma requisição que sai
 * disfarçada, porque a variável já não se parece com uma.
 *
 * Foi assim que o `-u` furou o C4 na primeira rodada, em base64. O
 * `--data-urlencode` repetiu a façanha em percent-encoding, no caminho que o
 * conserto abriu. Daí uma regra só: valor com chave dentro não é interpretado
 * — ou passa inteiro, ou é relatado.
 */
describe('C4: nenhuma decisão do importador é tomada sobre uma chave', () => {
  it('não codifica --data-urlencode que contém variável; relata', () => {
    // Codificar aqui transformaria `{{term}}` em `%7B%7Bterm%7D%7D`, e aí nem o
    // `resolve` nem a varredura de sobreviventes o reconheceriam. Sairia na
    // fita disfarçado, que é exatamente a falha da rodada passada.
    const { spec, ignored } = importing(`curl https://x.dev/a --data-urlencode 'q={{term}}'`)

    expect(spec.body).toBeNull()
    expect(ignored).toEqual(['--data-urlencode q={{term}}'])
  })

  it('continua codificando quando não há variável nenhuma', () => {
    const { spec, ignored } = importing(`curl https://x.dev/a --data-urlencode 'q=dois pontos & cia'`)

    expect(spec.body).toBe('q=dois%20pontos%20%26%20cia')
    expect(ignored).toEqual([])
  })

  it('corta o -u no dois-pontos de fora da chave, não no de dentro', () => {
    const { spec } = importing(`curl https://x.dev/a -u '{{user}}:{{senha}}'`)

    expect(spec.auth).toEqual({ user: '{{user}}', password: '{{senha}}' })
  })

  it('carrega a credencial inteira quando não há dois-pontos para cortar', () => {
    // `-u '{{cred}}'` com `cred = "u:p"`: cortar agora daria usuário
    // `{{cred}}` e senha vazia, e a fita levaria `u:p:`. Sem corte, a chave
    // chega inteira na interpolação e o `:` real aparece depois.
    const { spec } = importing(`curl https://x.dev/a -u '{{cred}}'`)

    expect(spec.auth).toEqual({ user: '{{cred}}', password: null })
    expect(wireOf(spec, { cred: 'u:p' }).headers).toEqual([
      { name: 'Authorization', value: `Basic ${btoaLike('u:p')}` },
    ])
  })

  it('o -b decide por um = de fora da chave', () => {
    const comChave = importing(`curl https://x.dev/a -b '{{cookies}}'`)

    expect(comChave.spec.headers).toEqual([])
    expect(comChave.ignored).toEqual(['-b {{cookies}}'])
  })

  it('a variável continua visível ao resolve em todos esses caminhos', () => {
    const { spec } = importing(`curl https://x.dev/a -u '{{cred}}'`)

    expect(() => wireOf(spec, {})).toThrow(UnresolvedVariableError)
  })
})

/** Base64 de referência, para o teste não depender da implementação do pacote. */
function btoaLike(text: string): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const bytes = [...text].map((c) => c.charCodeAt(0))
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i]!, bytes[i + 1], bytes[i + 2]]
    out += A[a >> 2]! + A[((a & 3) << 4) | ((b ?? 0) >> 4)]!
    out += b === undefined ? '=' : A[((b & 15) << 2) | ((c ?? 0) >> 6)]!
    out += c === undefined ? '=' : A[c & 63]!
  }
  return out
}
