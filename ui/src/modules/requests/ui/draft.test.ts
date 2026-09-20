import type { SavedRequest } from '@dailly/requests-core'
import { describe, expect, it } from 'vitest'
import { draftOf, importCurl, savedOf } from './draft.js'

const saved = (spec: unknown): SavedRequest => ({
  id: 'r1',
  name: 'charge',
  protocol: 'http',
  spec,
  folderId: null,
  position: 0,
})

describe('C3: colar um curl recria a request', () => {
  it('traz método, URL, headers e corpo para os campos', () => {
    const imported = importCurl(
      `curl -X POST https://api.stripe.com/v1/charges -H 'Content-Type: application/json' -d '{"amount":100}'`,
    )

    expect(imported).toMatchObject({
      kind: 'imported',
      draft: {
        method: 'POST',
        url: 'https://api.stripe.com/v1/charges',
        headers: [{ name: 'Content-Type', value: 'application/json' }],
        body: '{"amount":100}',
      },
    })
  })

  it('traz o -u como usuário e senha legíveis, não como um blob', () => {
    // O `-u` fica em claro no spec de propósito (B1): materializar o Basic na
    // importação faria a pessoa ver um base64 onde ela digitou a senha dela, e
    // um `{{user}}` lá dentro deixaria de ser variável.
    const imported = importCurl(`curl https://x.dev -u sk_test:senha`)

    expect(imported).toMatchObject({
      kind: 'imported',
      draft: { auth: { user: 'sk_test', password: 'senha' } },
    })
  })

  it('mantém a senha nula quando o curl não trouxe dois-pontos', () => {
    const imported = importCurl(`curl https://x.dev -u '{{credencial}}'`)

    expect(imported).toMatchObject({
      kind: 'imported',
      draft: { auth: { user: '{{credencial}}', password: null } },
    })
  })
})

describe('C4: o que o importador ignorou aparece na tela', () => {
  it('devolve as flags que não aplicou', () => {
    const imported = importCurl(`curl --compressed -k https://x.dev`)

    expect(imported).toMatchObject({ kind: 'imported' })
    if (imported.kind !== 'imported') throw new Error('esperava import')
    // Não é zelo: `--compressed` vem em praticamente todo curl copiado do
    // DevTools, e `-k` desliga verificação de certificado. Quem colou precisa
    // saber que o segundo **não** foi aplicado.
    expect(imported.ignored).toContain('-k')
    expect(imported.ignored).toContain('--compressed')
  })
})

describe('C5: um curl que não dá para ler recusa com o motivo', () => {
  it('recusa um texto que não é curl', () => {
    const imported = importCurl('GET /v1/charges HTTP/1.1')

    expect(imported.kind).toBe('rejected')
    if (imported.kind !== 'rejected') throw new Error('esperava recusa')
    expect(imported.reason).not.toBe('')
  })

  it('recusa um curl sem URL', () => {
    const imported = importCurl('curl -X POST -H "a: b"')

    expect(imported.kind).toBe('rejected')
  })

  it('recusa aspas que não fecham, dizendo o que houve', () => {
    const imported = importCurl(`curl 'https://x.dev`)

    expect(imported.kind).toBe('rejected')
    if (imported.kind !== 'rejected') throw new Error('esperava recusa')
    expect(imported.reason.toLowerCase()).toContain('aspa')
  })

  it('não cria request nenhuma quando recusa', () => {
    const imported = importCurl('nada disso')

    expect('draft' in imported).toBe(false)
  })
})

describe('o rascunho vai e volta sem perder nada', () => {
  it('lê uma request salva para os campos', () => {
    const draft = draftOf(
      saved({
        method: 'GET',
        url: 'https://x.dev',
        headers: [{ name: 'A', value: 'b' }],
        body: null,
        query: ['q=1'],
        auth: null,
      }),
    )

    expect(draft).toMatchObject({
      name: 'charge',
      method: 'GET',
      url: 'https://x.dev',
      headers: [{ name: 'A', value: 'b' }],
      body: '',
      query: ['q=1'],
      auth: null,
    })
  })

  it('devolve null para uma request cujo spec o servidor não conseguiu ler', () => {
    // O servidor lista `spec: null` justamente para a request poder ser
    // apagada. Um leitor que estourasse aqui tiraria da tela a única coisa que
    // ela ainda pode fazer com ela.
    expect(draftOf(saved(null))).toBeNull()
    expect(draftOf(saved({ method: 'GET' }))).toBeNull()
  })

  it('preserva o que o curl trouxe ao salvar, inclusive a query do -G', () => {
    // O `-G` fica fora da URL até o `toWire` (B1). Um `savedOf` que o colasse
    // aqui escolheria entre `?` e `&` olhando um texto que pode ser
    // `{{baseUrl}}` — o defeito que a query separada existe para evitar.
    const imported = importCurl(`curl -G https://x.dev -d q=1 -d p=2`)
    if (imported.kind !== 'imported') throw new Error('esperava import')

    const request = savedOf(imported.draft, { id: 'r9', position: 3 })

    expect(request).toMatchObject({ id: 'r9', position: 3, protocol: 'http' })
    expect(request?.spec).toMatchObject({ url: 'https://x.dev', query: ['q=1', 'p=2'] })
  })

  it('recusa salvar um rascunho sem URL, em vez de gravar algo inexecutável', () => {
    const draft = draftOf(
      saved({ method: 'GET', url: 'https://x.dev', headers: [], body: null, query: [], auth: null }),
    )!

    expect(savedOf({ ...draft, url: '   ' }, { id: 'r1', position: 0 })).toBeNull()
  })
})
