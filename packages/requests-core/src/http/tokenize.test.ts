import { describe, expect, it } from 'vitest'
import { UnterminatedQuoteError, tokenize } from './index.js'

/**
 * O tokenizer, sozinho.
 *
 * Ele tem teste próprio porque é a maior superfície do pacote e porque os bugs
 * dele não parecem bugs dele: um corpo corrompido aqui chega no `from-raw`
 * como um corpo, e o erro só aparece quando o servidor responde 400.
 */
describe('aspas duplas, que é o exemplo do C1 que não tinha teste', () => {
  it('trata \\" como aspa literal, e não como fim da citação', () => {
    // JSON entre aspas duplas é como Stripe, Postman e o `cmd` do Windows
    // escrevem. Sem isto o corpo vira `{\a\:1}` — sem erro e sem relato.
    expect(tokenize(String.raw`curl -d "{\"a\":1}"`)).toEqual(['curl', '-d', '{"a":1}'])
  })

  it('mantém aspa simples dentro de aspa dupla como caractere comum', () => {
    expect(tokenize(`curl -d "não é fim"`)).toEqual(['curl', '-d', 'não é fim'])
  })

  it('escapa a barra invertida e o cifrão, como o shell faz', () => {
    expect(tokenize(String.raw`curl -d "a\\b"`)).toEqual(['curl', '-d', String.raw`a\b`])
    expect(tokenize(String.raw`curl -d "custa \$5"`)).toEqual(['curl', '-d', 'custa $5'])
  })

  it('deixa passar literal a barra que não escapa nada, como o shell também faz', () => {
    expect(tokenize(String.raw`curl -d "C:\temp"`)).toEqual(['curl', '-d', String.raw`C:\temp`])
  })

  it('não interpreta barra invertida dentro de aspas simples', () => {
    // Aspa simples no shell é literal de verdade: nada dentro dela escapa.
    expect(tokenize(String.raw`curl -d '{\"a\":1}'`)).toEqual(['curl', '-d', String.raw`{\"a\":1}`])
  })

  it('recusa aspa dupla que nunca fecha', () => {
    expect(() => tokenize(`curl -d "sem fim`)).toThrow(UnterminatedQuoteError)
  })
})

describe('a quebra de linha, nas duas convenções', () => {
  it('junta as linhas com \\n, como o DevTools do Linux e do Mac emitem', () => {
    expect(tokenize("curl 'https://x.dev/a' \\\n  -H 'A: 1'")).toEqual([
      'curl',
      'https://x.dev/a',
      '-H',
      'A: 1',
    ])
  })

  it('junta as linhas com \\r\\n, que é o que vem da área de transferência do Windows', () => {
    // Sem isto a barra invertida vira um token só dela, sobra token solto, e a
    // pessoa recebe um erro falando de URL ambígua por ter copiado no Windows.
    expect(tokenize("curl 'https://x.dev/a' \\\r\n  -H 'A: 1' \\\r\n  --data-raw 'oi'")).toEqual([
      'curl',
      'https://x.dev/a',
      '-H',
      'A: 1',
      '--data-raw',
      'oi',
    ])
  })
})
