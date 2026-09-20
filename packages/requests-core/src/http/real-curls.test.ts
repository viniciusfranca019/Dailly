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

describe('C1: --data-urlencode segue a regra do curl, não a minha', () => {
  it('o primeiro = vence; o @ só é arquivo quando nenhum = vem antes', () => {
    // Verificado contra curl de verdade: `--data-urlencode 'email=a@b.com'`
    // manda `email=a%40b.com`. Tratar qualquer `@` como arquivo descartava o
    // corpo de um comando perfeitamente legítimo.
    const { spec, ignored } = importing(`curl https://x.dev/a --data-urlencode 'email=a@b.com'`)

    expect(spec.body).toBe('email=a%40b.com')
    expect(spec.method).toBe('POST')
    expect(ignored).toEqual([])
  })

  it('sem = antes, o @ é a forma de arquivo e é relatada', () => {
    const { spec, ignored } = importing(`curl https://x.dev/a --data-urlencode '@corpo.json'`)

    expect(spec.body).toBeNull()
    expect(ignored).toEqual(['--data-urlencode @corpo.json'])
  })
})

describe('C6: a forma de arquivo do corpo é relatada, não mandada literal', () => {
  it('relata -d @arquivo em vez de enviar o texto "@arquivo"', () => {
    // O curl lê o arquivo; deste lado da fronteira não há arquivo nenhum.
    // Mandar `@corpo.json` como corpo é a única saída que nem funciona nem
    // avisa — e o pacote já relata o equivalente no `--data-urlencode @…` e no
    // `-b cookies.txt`. Era a mesma decisão faltando num ramo só.
    const { spec, ignored } = importing('curl https://x.dev/a -d @corpo.json')

    expect(spec.body).toBeNull()
    expect(ignored).toEqual(['-d @corpo.json'])
  })

  it('--data-raw manda o @ literal, porque é isso que ele existe para fazer', () => {
    // A diferença é a razão de ser do `--data-raw`: ele é o `-d` que **não**
    // interpreta `@`. Relatá-lo aqui inverteria a semântica dele.
    expect(importing('curl https://x.dev/a --data-raw @literal').spec.body).toBe('@literal')
  })

  it('o @ no meio do valor não é forma de arquivo', () => {
    // Só o `@` inicial marca arquivo: `-d 'email=a@b.com'` é corpo comum.
    expect(importing(`curl https://x.dev/a -d 'email=a@b.com'`).spec.body).toBe('email=a@b.com')
  })
})

describe('C1: o -G não é uma flag a ignorar, é o que decide método e destino', () => {
  it('manda os dados para a query e mantém GET, como o curl faz', () => {
    // A documentação da Stripe é escrita assim. Ignorar o `-G` e relatar
    // deixava de pé um POST para `/v1/charges` com `limit=3` — ou seja, o
    // preview mostrava uma **criação de cobrança** onde a pessoa colou uma
    // leitura. Não é o caso do C6: `--compressed` ignorado é a mesma
    // requisição sem um recurso; `-G` ignorado é outra requisição.
    const { spec, ignored } = importing('curl -G -d limit=3 -d x=1 https://api.stripe.com/v1/charges')

    expect(spec.method).toBe('GET')
    expect(spec.url).toBe('https://api.stripe.com/v1/charges')
    expect(spec.query).toEqual(['limit=3', 'x=1'])
    expect(spec.body).toBeNull()
    expect(ignored).toEqual([])
  })

  it('junta com & quando a URL já tem query', () => {
    const { spec } = importing(`curl -G --data-urlencode 'q=a b' 'https://x.dev/a?j=1'`)

    expect(spec.query).toEqual(['q=a%20b'])
    expect(spec.body).toBeNull()
  })

  it('sem dado nenhum, o -G é só um GET', () => {
    const { spec } = importing('curl -G https://x.dev/a')

    expect(spec.url).toBe('https://x.dev/a')
    expect(spec.method).toBe('GET')
  })

  it('o -X explícito continua vencendo, porque é o que o curl faz', () => {
    expect(importing('curl -G -X HEAD -d a=1 https://x.dev/a').spec.method).toBe('HEAD')
  })

  it('o -G não mexe na chave que atravessa para a query', () => {
    // `&` e `?` são estruturais: vêm das flags e da URL, nunca de dentro de um
    // valor. A chave passa inteira e continua visível ao resolve.
    expect(importing('curl -G -d "q={{termo}}" https://x.dev/a').spec.query).toEqual([
      'q={{termo}}',
    ])
  })

  it('-I vira HEAD, que é o método que ele pede', () => {
    const { spec, ignored } = importing('curl -I https://x.dev/a')

    expect(spec.method).toBe('HEAD')
    expect(ignored).toEqual([])
  })
})
