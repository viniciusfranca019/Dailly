import { describe, expect, it } from 'vitest'
import { httpDriver } from './index.js'

/**
 * C1 — um curl colado vira a request que ele descreve.
 *
 * A tabela é o cenário: as linhas diferem só no texto de entrada, e a regra que
 * cada uma prova é a mesma — o que o texto diz entra, e nada além disso.
 *
 * O importador é `fromRaw` e não `fromCurl` porque a forma crua é do
 * protocolo, não do curl: um driver gRPC amanhã terá a sua, e o modelo chama a
 * mesma coisa nos dois.
 */
describe('C1: um curl colado vira a request que ele descreve', () => {
  const importing = (raw: string) => httpDriver.fromRaw(raw)

  it('lê o método, a URL e nada mais quando é só isso', () => {
    const { spec } = importing('curl https://api.exemplo.com/entries')

    expect(spec).toEqual({
      method: 'GET',
      url: 'https://api.exemplo.com/entries',
      headers: [],
      body: null,
      query: [],
      auth: null,
    })
  })

  it('com -d e sem -X é POST, como o próprio curl faz', () => {
    // Não é detalhe de implementação: é a regra do curl, e alguém que cola um
    // `-d` espera o mesmo verbo que o terminal usaria.
    const { spec } = importing(`curl https://x.dev/a -d '{"a":1}'`)

    expect(spec.method).toBe('POST')
    expect(spec.body).toBe('{"a":1}')
  })

  it('respeita o -X explícito mesmo com corpo', () => {
    expect(importing(`curl -X PUT https://x.dev/a -d 'oi'`).spec.method).toBe('PUT')
  })

  it('guarda todos os -H, na ordem, porque header repetido é legítimo', () => {
    // `Set-Cookie` e `Accept` repetem de verdade. Um mapa perderia o segundo, e
    // é por isso que o schema guarda uma lista de pares.
    const { spec } = importing(
      `curl https://x.dev/a -H 'Accept: application/json' -H 'Accept: text/plain' -H 'X-Tenant: konsi'`,
    )

    expect(spec.headers).toEqual([
      { name: 'Accept', value: 'application/json' },
      { name: 'Accept', value: 'text/plain' },
      { name: 'X-Tenant', value: 'konsi' },
    ])
  })

  it('junta as linhas que o DevTools quebrou com barra invertida', () => {
    const { spec } = importing(
      ["curl 'https://x.dev/a' \\", "  -X POST \\", "  -H 'A: 1' \\", `  --data-raw '{"b":2}'`].join('\n'),
    )

    expect(spec.method).toBe('POST')
    expect(spec.url).toBe('https://x.dev/a')
    expect(spec.headers).toEqual([{ name: 'A', value: '1' }])
    expect(spec.body).toBe('{"b":2}')
  })

  it('lê a citação ANSI-C do bash, que é como um corpo com quebra de linha chega', () => {
    // `$'...'` é o que o DevTools emite quando o corpo tem `\n` dentro. Tratar
    // o `$` como caractere comum deixaria um cifrão no começo do corpo.
    const { spec } = importing(`curl https://x.dev/a --data-raw $'linha1\\nlinha2'`)

    expect(spec.body).toBe('linha1\nlinha2')
  })

  it('lê o -u para dentro do spec, em claro', () => {
    // A tabela do C1 diz "vira header de autorização", e vira — mas na fita,
    // não na importação. Materializar aqui fecharia a credencial em base64
    // antes da interpolação rodar, e `{{user}}` deixaria de ser variável.
    // `auth.test.ts` prova a volta inteira, do texto colado até o header.
    const { spec } = importing(`curl https://x.dev/a -u 'aladdin:opensesame'`)

    expect(spec.auth).toEqual({ user: 'aladdin', password: 'opensesame' })
  })
})
