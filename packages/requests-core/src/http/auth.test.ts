import { describe, expect, it } from 'vitest'
import { ProtocolRegistry, resolve } from '../index.js'
import { type HttpWire, httpDriver } from './index.js'

const registry = () => new ProtocolRegistry().register(httpDriver)

/**
 * O `-u`, e por que ele não pode virar header na importação.
 *
 * A tabela do C1 diz "`-u user:pass` → header de autorização", e virar header
 * *na importação* satisfaz a letra. Só que aí a credencial já está em base64
 * quando o `resolve()` roda — e `{{user}}` dentro dela deixa de ser uma
 * variável e passa a ser um punhado de bytes.
 *
 * O resultado é exatamente a falha que o C4 existe para impedir, produzida
 * pelo próprio importador do pacote, e invisível porque está codificada. Daí a
 * credencial morar no spec e virar header só na fita.
 */
describe('C4: a credencial do -u passa pela interpolação como todo o resto', () => {
  const withVariables = httpDriver.fromRaw(`curl https://x.dev/a -u '{{user}}:{{senha}}'`)

  it('guarda usuário e senha no spec, não um base64 fechado', () => {
    expect(withVariables.spec.auth).toEqual({ user: '{{user}}', password: '{{senha}}' })
    expect(withVariables.spec.headers).toEqual([])
  })

  it('recusa a requisição quando falta a variável da senha', () => {
    // Antes isto passava: o base64 de `{{senha}}` não parece uma variável para
    // ninguém, então a requisição saía com uma credencial literalmente falsa e
    // o servidor respondia 401.
    const request = { id: 'r', name: 'n', protocol: 'http', spec: withVariables.spec }

    expect(() => resolve(registry(), request, { user: 'vinicius' })).toThrow(/senha/)
  })

  it('materializa o Basic na fita, já com os valores resolvidos', () => {
    const request = { id: 'r', name: 'n', protocol: 'http', spec: withVariables.spec }

    const wire = resolve<HttpWire>(registry(), request, { user: 'aladdin', senha: 'opensesame' })

    expect(wire.headers).toEqual([
      { name: 'Authorization', value: 'Basic YWxhZGRpbjpvcGVuc2VzYW1l' },
    ])
  })

  it('sem -u não inventa header nenhum', () => {
    const { spec } = httpDriver.fromRaw(`curl https://x.dev/a -H 'A: 1'`)
    const wire = resolve<HttpWire>(registry(), { id: 'r', name: 'n', protocol: 'http', spec }, {})

    expect(wire.headers).toEqual([{ name: 'A', value: '1' }])
  })

  it('senha com dois-pontos dentro continua inteira', () => {
    // `-u user:a:b` é senha `a:b` — só o primeiro dois-pontos separa.
    const { spec } = httpDriver.fromRaw(`curl https://x.dev/a -u 'u:a:b'`)

    expect(spec.auth).toEqual({ user: 'u', password: 'a:b' })
  })
})
