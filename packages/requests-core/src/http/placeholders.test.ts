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

describe('C4: nem a montagem da query é decidida sobre uma chave', () => {
  it('junta a query depois da interpolação, quando a URL é uma variável', () => {
    // `curl -G -d 'q=1' '{{baseUrl}}'` com baseUrl = `https://x.dev/a?j=1`.
    // Decidir `?` na importação olharia para `{{baseUrl}}`, que não tem `?`, e
    // produziria `https://x.dev/a?j=1?q=1` — URL quebrada por um segundo `?`.
    //
    // `{{baseUrl}}` é a variável mais comum desta categoria de ferramenta, e
    // `-G` é o idioma da documentação da Stripe: recusar a combinação perderia
    // o caso comum. Adiar a junção para a fita é a mesma decisão que o `-u` já
    // tomou, e pela mesma razão.
    const { spec } = importing(`curl -G -d 'q=1' '{{baseUrl}}'`)

    expect(spec.url).toBe('{{baseUrl}}')
    expect(spec.query).toEqual(['q=1'])

    expect(wireOf(spec, { baseUrl: 'https://x.dev/a?j=1' }).url).toBe('https://x.dev/a?j=1&q=1')
  })

  it('usa ? quando a URL resolvida não tem query', () => {
    const { spec } = importing(`curl -G -d 'q=1' '{{baseUrl}}'`)

    expect(wireOf(spec, { baseUrl: 'https://x.dev/a' }).url).toBe('https://x.dev/a?q=1')
  })

  it('não duplica o separador quando a URL já termina em ?', () => {
    // Verificado contra curl de verdade: `…/D?` com `-d q=1` vira `…/D?q=1`,
    // e não `…/D?&q=1`.
    const { spec } = importing(`curl -G -d 'q=1' 'https://x.dev/d?'`)

    expect(wireOf(spec, {}).url).toBe('https://x.dev/d?q=1')
  })

  it('a chave dentro do próprio dado também atravessa até a fita', () => {
    const { spec } = importing(`curl -G -d 'q={{termo}}' 'https://x.dev/a'`)

    expect(wireOf(spec, { termo: 'busca' }).url).toBe('https://x.dev/a?q=busca')
  })
})

describe('C4: o -H era o último sítio fora da regra', () => {
  it('não corta num dois-pontos que está dentro de uma chave', () => {
    // `-u` e `-b` já usavam `indexOutsidePlaceholder`; o `-H` continuava com
    // `indexOf(':')` puro. Uma regra que vale em todos os lugares menos um
    // não é uma regra — é um hábito com exceção.
    const { headers, ignored } = (() => {
      const r = importing(`curl https://x.dev/a -H '{{a:b}}'`)
      return { headers: r.spec.headers, ignored: r.ignored }
    })()

    expect(headers).toEqual([])
    expect(ignored).toEqual(['-H {{a:b}}'])
  })

  it('continua cortando no dois-pontos de fora', () => {
    expect(importing(`curl https://x.dev/a -H 'X-Tenant: {{cliente}}'`).spec.headers).toEqual([
      { name: 'X-Tenant', value: '{{cliente}}' },
    ])
  })
})

describe('C4: a recusa nomeia variáveis que existem, não pedaços de JSON', () => {
  it('não inventa nome de variável atravessando a fronteira entre campos', () => {
    // A varredura rodava sobre `JSON.stringify`, então `[^}\s]+` comia através
    // de um campo e a mensagem saía com `{{a","value":"b}}` dentro.
    const { spec } = importing(`curl https://x.dev/a -H 'X-A: {{um}}' -d '{{dois}}'`)
    let caught: UnresolvedVariableError | undefined
    try {
      wireOf(spec, {})
    } catch (error) {
      caught = error as UnresolvedVariableError
    }

    expect(caught?.missing.sort()).toEqual(['dois', 'um'])
    expect(caught?.message).not.toContain('"')
  })

  it('não recusa uma requisição que não tem variável nenhuma', () => {
    // O falso positivo construível: um campo terminando em `{{` colado a
    // outro começando em `}}` formava uma "chave" que só existe no JSON.
    const { spec } = importing(`curl https://x.dev/a -d 'x{{' -u '}}y:p'`)

    expect(() => wireOf(spec, {})).not.toThrow()
  })
})

describe('C1: -A e -e são headers, e a ADR 0011 os nomeia', () => {
  it('mapeia -A para User-Agent e -e para Referer', () => {
    // A ADR 0011 cita `Referer` e `User-Agent` entre os headers que um
    // renderer não consegue definir — é parte de *por que* a execução mora no
    // servidor. O comentário do `-b` já faz esse argumento para o `Cookie`;
    // descartar estes dois era fazer o argumento e ir para o outro lado.
    const { spec, ignored } = importing(
      `curl https://x.dev/a -A 'Mozilla/5.0' -e 'https://ref.dev'`,
    )

    expect(spec.headers).toEqual([
      { name: 'User-Agent', value: 'Mozilla/5.0' },
      { name: 'Referer', value: 'https://ref.dev' },
    ])
    expect(ignored).toEqual([])
  })
})

describe('C6: o --url não é ignorado, ele diz qual é a URL', () => {
  it('não relata como não aplicado algo cujo valor foi aplicado', () => {
    const { spec, ignored } = importing(`curl --url https://x.dev/a -H 'A: 1'`)

    expect(spec.url).toBe('https://x.dev/a')
    expect(ignored).toEqual([])
  })
})
