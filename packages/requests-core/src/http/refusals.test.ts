import { describe, expect, it } from 'vitest'
import { NotACurlError, UnterminatedQuoteError, httpDriver } from '@dailly/requests-core/http'

const importing = (raw: string) => httpDriver.fromRaw(raw)

/**
 * C2 — o curl que não dá pra entender é recusado dizendo onde.
 *
 * As duas recusas são de classes diferentes e por isso estão nomeadas
 * separadamente: uma é "isto não é um curl", outra é "isto é um curl que eu não
 * consigo terminar de ler". Um erro só para as duas mandaria a pessoa procurar
 * no lugar errado.
 */
describe('C2: o curl que não dá pra entender é recusado dizendo onde', () => {
  it('recusa texto que não começa com curl', () => {
    expect(() => importing('GET /entries HTTP/1.1')).toThrow(NotACurlError)
  })

  it('recusa texto vazio pelo mesmo motivo, em vez de devolver uma request oca', () => {
    // Uma request com método GET e URL vazia é pior que um erro: ela parece
    // ter funcionado.
    expect(() => importing('   ')).toThrow(NotACurlError)
  })

  it('recusa aspa que nunca fecha, dizendo qual', () => {
    const boom = () => importing(`curl https://x.dev/a -d 'sem fim`)

    expect(boom).toThrow(UnterminatedQuoteError)
    expect(boom).toThrow(/'/)
  })

  it('nenhuma request parcial nasce de um texto recusado', () => {
    // A recusa é total. Devolver o que deu para ler é como um parser que
    // entrega meia árvore: o consumidor não tem como saber o que falta.
    expect(() => importing(`curl 'https://x.dev/a -H 'A: 1'`)).toThrow()
  })
})

/**
 * C6 — a flag que o importador não conhece é ignorada e relatada.
 *
 * As três saídas possíveis, e por que esta: recusar o desconhecido torna a
 * função inútil no caso mais comum, porque o DevTools põe `--compressed` em
 * quase todo curl que se copia. Ignorar em silêncio é o que Postman e Insomnia
 * fazem, e é o que faz alguém colar um `--cert` achando que foi aplicado.
 * Passar e dizer o que ficou de fora atende os dois.
 */
describe('C6: a flag desconhecida é ignorada e relatada, nunca aplicada em silêncio', () => {
  it('importa apesar do --compressed, que é o caso mais comum de todos', () => {
    const { spec, ignored } = importing(`curl 'https://x.dev/a' --compressed -H 'A: 1'`)

    expect(spec.url).toBe('https://x.dev/a')
    expect(spec.headers).toEqual([{ name: 'A', value: '1' }])
    expect(ignored).toEqual(['--compressed'])
  })

  it('relata a flag com o valor que veio junto, para a pessoa ver o que perdeu', () => {
    // `--cert x.pem` sem o `x.pem` no relato não diz nada: o que importa é que
    // *aquele certificado* não foi aplicado.
    const { ignored } = importing(`curl https://x.dev/a --cert cliente.pem --insecure`)

    expect(ignored).toEqual(['--cert cliente.pem', '--insecure'])
  })

  it('não inventa relato quando entendeu tudo', () => {
    expect(importing(`curl https://x.dev/a -X POST -d 'oi'`).ignored).toEqual([])
  })
})

describe('C2: uma flag desconhecida não pode roubar o lugar da URL', () => {
  /**
   * O buraco que aparece ao implementar o C6, e que seria silencioso.
   *
   * Para relatar `--cert cliente.pem` é preciso saber que `--cert` consome o
   * próximo token. Se não souber, `cliente.pem` sobra solto e vira a URL — e a
   * request resultante aponta para um arquivo. Ela *parece* ter funcionado, que
   * é a pior forma de errar.
   *
   * A tabela cobre o que curl de verdade traz. Para o que ela não cobre, o
   * sinal é um segundo token solto: duas URLs é coisa que este importador não
   * sabe interpretar, e dizer isso é melhor que escolher uma.
   */
  it('recusa quando sobra mais de um token solto, em vez de escolher um', () => {
    const boom = () => importing(`curl --opcao-que-nao-existe valor https://x.dev/a`)

    expect(boom).toThrow(/valor/)
    expect(boom).toThrow(/https:\/\/x\.dev\/a/)
  })

  it('não confunde o valor de uma flag conhecida com uma segunda URL', () => {
    const { spec, ignored } = importing(`curl --proxy http://proxy:3128 https://x.dev/a`)

    expect(spec.url).toBe('https://x.dev/a')
    expect(ignored).toEqual(['--proxy http://proxy:3128'])
  })
})
