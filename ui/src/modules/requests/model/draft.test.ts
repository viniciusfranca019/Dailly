import { ProtocolRegistry, resolve, type SavedRequest } from '@dailly/requests-core'
import { httpDriver, type HttpWire } from '@dailly/requests-core/http'
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

  it('não descarta o corpo de um GET que o curl mandava', () => {
    // `curl -X GET -d '...'` é o idioma do Elasticsearch e de várias APIs de
    // busca, e o curl de verdade manda o corpo. Zerar aqui mostrava o corpo na
    // tela e gravava `null` — aplicar em silêncio, que é o contrário do que
    // este módulo decidiu fazer com o que não entende.
    const imported = importCurl(`curl -X GET https://x.dev/_search -d '{"q":1}'`)
    if (imported.kind !== 'imported') throw new Error('esperava import')

    expect(imported.draft.body).toBe('{"q":1}')
    expect(savedOf(imported.draft, { id: 'r1', position: 0 })?.spec).toMatchObject({
      method: 'GET',
      body: '{"q":1}',
    })
  })

  it('corpo vazio continua sendo ausência de corpo, não corpo de zero byte', () => {
    const imported = importCurl('curl https://x.dev')
    if (imported.kind !== 'imported') throw new Error('esperava import')

    expect(savedOf(imported.draft, { id: 'r1', position: 0 })?.spec).toMatchObject({ body: null })
  })

  it('dá identidade estável a cada linha de header, e não a grava', () => {
    // A linha precisa de chave estável para o `v-for`: com o índice, remover a
    // primeira de duas destrói o nó da segunda, que é onde está o cursor. E a
    // chave **não** pode vazar para o spec — `httpDriver.validate` castra o
    // objeto e propriedade extra sobreviveria até o banco.
    const imported = importCurl(`curl https://x.dev -H 'A: 1' -H 'A: 2'`)
    if (imported.kind !== 'imported') throw new Error('esperava import')

    const [first, second] = imported.draft.headers
    expect(first?.id).toBeTruthy()
    expect(first?.id).not.toBe(second?.id)

    const spec = savedOf(imported.draft, { id: 'r1', position: 0 })?.spec as {
      headers: Record<string, unknown>[]
    }
    expect(spec.headers).toEqual([
      { name: 'A', value: '1' },
      { name: 'A', value: '2' },
    ])
  })

  it('a senha nula atravessa o salvamento sem virar texto vazio', () => {
    // `null` quer dizer "o curl não trouxe dois-pontos", e a diferença é
    // observável na fita: `null` e `''` produzem `Authorization` diferentes.
    const imported = importCurl(`curl https://x.dev -u '{{credencial}}'`)
    if (imported.kind !== 'imported') throw new Error('esperava import')

    expect(savedOf(imported.draft, { id: 'r1', position: 0 })?.spec).toMatchObject({
      auth: { user: '{{credencial}}', password: null },
    })
  })
})

describe('a razão de o botão de separar credencial existir', () => {
  const registry = new ProtocolRegistry().register(httpDriver)

  const authorizationOf = (draft: ReturnType<typeof draftOf>, env: Record<string, string>) => {
    if (draft === null) throw new Error('esperava rascunho')
    const saved = savedOf(draft, { id: 'r1', position: 0 })
    if (saved === null) throw new Error('esperava request')
    const wire = resolve<HttpWire>(registry, saved, env)
    return wire.headers.find((header) => header.name === 'Authorization')?.value
  }

  it('senha nula e senha vazia produzem credenciais diferentes na fita', () => {
    /**
     * Esta asserção é o motivo de a tela ter um botão em vez de um campo.
     *
     * A afirmação circulou como "provado por execução" e era leitura de
     * `basicCredential`. Vira teste aqui porque a diferença é **invisível**:
     * as duas viajam em base64, e uma conclusão errada só apareceria como um
     * 401 num curl que funciona no terminal — o mesmo formato do defeito do
     * `-u` sem dois-pontos que o B1 já pagou uma vez.
     *
     * Se as duas produzissem o mesmo header, o botão seria cerimônia e o
     * achado do gate não existiria. Produzem coisas diferentes.
     */
    const imported = importCurl(`curl https://x.dev -u '{{cred}}'`)
    if (imported.kind !== 'imported') throw new Error('esperava import')
    const env = { cred: 'sk_live:s3nha' }

    const comNulo = authorizationOf(imported.draft, env)
    const comVazio = authorizationOf(
      { ...imported.draft, auth: { user: '{{cred}}', password: '' } },
      env,
    )

    expect(comNulo).not.toBe(comVazio)
    expect(atob(String(comNulo).replace('Basic ', ''))).toBe('sk_live:s3nha')
    // A senha vira `s3nha:` — o alvo responde 401 e a razão está codificada.
    expect(atob(String(comVazio).replace('Basic ', ''))).toBe('sk_live:s3nha:')
  })
})
