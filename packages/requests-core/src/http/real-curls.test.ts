import { describe, expect, it } from 'vitest'
import { MissingUrlError, httpDriver } from './index.js'

const importing = (raw: string) => httpDriver.fromRaw(raw)

/**
 * Os curls que as pessoas realmente colam.
 *
 * A tabela do C1 foi escrita a partir do que eu imaginava que chegaria. Este
 * arquivo é o que chega de verdade — Safari, Chrome antigo, formulário, cookie
 * — e cada caso aqui estourava `AmbiguousUrlError`, mandando a pessoa procurar
 * uma flag desconhecida que não existia.
 */
describe('C1: as formas de corpo que não são -d', () => {
  it('aceita --data-binary, que é o que o Safari emite', () => {
    const { spec } = importing(`curl 'https://x.dev/a' --data-binary '{"a":1}' -H 'A: 1'`)

    expect(spec.body).toBe('{"a":1}')
    expect(spec.method).toBe('POST')
    expect(spec.url).toBe('https://x.dev/a')
  })

  it('junta -d repetido com &, como o curl faz', () => {
    // `curl -d a=1 -d b=2` manda `a=1&b=2`. Ficar com o último perderia metade
    // do corpo em silêncio — e o C1 já decidiu, para o -H, que repetição é
    // legítima e se preserva.
    expect(importing('curl https://x.dev/a -d a=1 -d b=2').spec.body).toBe('a=1&b=2')
  })

  it('codifica o valor de --data-urlencode, que é a razão de ele existir', () => {
    const { spec } = importing(`curl https://x.dev/a --data-urlencode 'q=dois pontos & e comercial'`)

    expect(spec.body).toBe('q=dois%20pontos%20%26%20e%20comercial')
  })
})

describe('C6: as flags que não dá para aplicar, relatadas em vez de derrubar', () => {
  it('não estoura com -F, e diz que o formulário não foi aplicado', () => {
    // Multipart não cabe num corpo de texto. Relatar é honesto; recusar o
    // comando inteiro por causa disso não é.
    const { spec, ignored } = importing(`curl 'https://x.dev/a' -F 'file=@x.png'`)

    expect(spec.url).toBe('https://x.dev/a')
    expect(ignored).toEqual(['-F file=@x.png'])
  })

  it('transforma -b em header de Cookie, que é o que ele é', () => {
    // A ADR 0011 apoia a decisão inteira de executar no servidor em `Cookie`
    // ser "metade do uso real". Recusar a flag que o carrega seria irônico.
    expect(importing(`curl https://x.dev/a -b 'sid=1; tema=escuro'`).spec.headers).toEqual([
      { name: 'Cookie', value: 'sid=1; tema=escuro' },
    ])
  })

  it('relata -b quando é arquivo de cookies, porque aí não é um header', () => {
    expect(importing('curl https://x.dev/a -b cookies.txt').ignored).toEqual(['-b cookies.txt'])
  })

  it('relata o -H sem dois-pontos em vez de fazê-lo sumir', () => {
    // `-H 'X-Foo'` é erro de digitação plausível. O C6 promete que nada é
    // descartado em silêncio, e isto era silencioso.
    expect(importing(`curl https://x.dev/a -H 'X-Foo'`).ignored).toEqual(['-H X-Foo'])
  })

  it('aceita curl.exe, que é o que o histórico do Windows devolve', () => {
    expect(importing('curl.exe https://x.dev/a').spec.url).toBe('https://x.dev/a')
  })
})

describe('C2: um curl sem URL é recusado, não devolvido oco', () => {
  it('recusa quando não sobrou token nenhum para ser a URL', () => {
    // O próprio teste de recusa já dizia a regra: "uma request com método GET e
    // URL vazia é pior que um erro, ela parece ter funcionado". A guarda pegava
    // dois tokens soltos e deixava passar zero.
    expect(() => importing('curl -X POST -d oi')).toThrow(MissingUrlError)
  })

  it('a mensagem diz o que faltou, não o que sobrou', () => {
    expect(() => importing('curl -X POST -d oi')).toThrow(/URL/)
  })
})
