import { describe, expect, it } from 'vitest'
import { parseEnv } from './env.js'

describe('C10: as variáveis que a pessoa digita', () => {
  it('lê uma por linha, no formato NOME=valor', () => {
    expect(parseEnv('token=abc\nbaseUrl=https://x.dev')).toEqual({
      token: 'abc',
      baseUrl: 'https://x.dev',
    })
  })

  it('ignora linhas vazias e comentários', () => {
    expect(parseEnv('\n# isto é um comentário\ntoken=abc\n')).toEqual({ token: 'abc' })
  })

  it('só corta no primeiro sinal de igual', () => {
    // Um valor com `=` dentro é o caso comum: base64, query string, JWT.
    expect(parseEnv('t=a=b=c')).toEqual({ t: 'a=b=c' })
  })

  it('não aceita uma linha sem nome', () => {
    expect(parseEnv('=solto\ntoken=abc')).toEqual({ token: 'abc' })
  })

  it('tira espaço em volta do nome, mas não do valor', () => {
    // O nome é uma chave e espaço nele é sempre engano. O valor é literal: uma
    // senha que termina em espaço é uma senha que termina em espaço, e aparar
    // faria a requisição sair diferente do que está escrito na tela.
    expect(parseEnv('  token  =  abc ')).toEqual({ token: '  abc ' })
  })
})
