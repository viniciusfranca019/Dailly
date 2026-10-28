// @vitest-environment jsdom
import type { ExecutedResponse } from '@shared'
import { describe, expect, it } from 'vitest'
import { decodeBody } from './decode.js'

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

/** O jsdom não tem `Blob.prototype.stream`, então a fonte é um stream à mão. */
const streamOf = (bytes: Uint8Array): ReadableStream<BufferSource> =>
  new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes))
      controller.close()
    },
  })

const compress = (text: string, format: 'gzip' | 'deflate') =>
  compressBytes(new TextEncoder().encode(text), format)

async function compressBytes(
  input: Uint8Array,
  format: 'gzip' | 'deflate',
): Promise<Uint8Array> {
  const source = streamOf(input)
  const chunks: Uint8Array[] = []
  const reader = source.pipeThrough(new CompressionStream(format)).getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.byteLength
  }
  return out
}

const response = (over: Partial<ExecutedResponse>): ExecutedResponse => ({
  status: 200,
  headers: [],
  body: '',
  encoding: 'utf-8',
  truncated: false,
  timedOut: false,
  bytes: 0,
  contentLength: null,
  durationMs: 1,
  ...over,
})

describe('C8: o corpo comprimido é descomprimido e mostrado como texto', () => {
  it('descomprime gzip', async () => {
    const bytes = await compress('{"ok":true}', 'gzip')
    const decoded = await decodeBody(
      response({
        encoding: 'base64',
        body: base64(bytes),
        headers: [{ name: 'content-encoding', value: 'gzip' }],
      }),
    )

    expect(decoded).toEqual({ kind: 'text', text: '{"ok":true}', truncated: false, ceiling: false })
  })

  it('descomprime deflate', async () => {
    const bytes = await compress('{"ok":true}', 'deflate')
    const decoded = await decodeBody(
      response({
        encoding: 'base64',
        body: base64(bytes),
        headers: [{ name: 'Content-Encoding', value: 'DEFLATE' }],
      }),
    )

    // O nome do header e o valor são comparados sem caixa: HTTP não distingue,
    // e um `Content-Encoding: GZIP` cairia no caminho do "não sei abrir".
    expect(decoded).toEqual({ kind: 'text', text: '{"ok":true}', truncated: false, ceiling: false })
  })

  it('deixa passar o que o servidor já entregou como texto', async () => {
    const decoded = await decodeBody(response({ body: 'oi', encoding: 'utf-8', truncated: true }))

    expect(decoded).toEqual({ kind: 'text', text: 'oi', truncated: true, ceiling: false })
  })

  it('lê base64 sem content-encoding quando o conteúdo é texto', async () => {
    const decoded = await decodeBody(
      response({ encoding: 'base64', body: base64(new TextEncoder().encode('olá')) }),
    )

    expect(decoded).toEqual({ kind: 'text', text: 'olá', truncated: false, ceiling: false })
  })
})

describe('C9: a codificação que não sei abrir é dita, não fingida', () => {
  it('não finge texto para brotli', async () => {
    // O Firefox manda `Accept-Encoding: gzip, deflate, br` no copy-as-cURL e o
    // importador preserva o header, então `br` chega. Nenhum navegador
    // descomprime brotli por `DecompressionStream`.
    const decoded = await decodeBody(
      response({
        encoding: 'base64',
        body: base64(new Uint8Array([0x1b, 0x02, 0x00])),
        headers: [{ name: 'content-encoding', value: 'br' }],
        bytes: 3,
      }),
    )

    expect(decoded.kind).toBe('opaque')
    if (decoded.kind !== 'opaque') throw new Error('esperava opaco')
    expect(decoded.encoding).toBe('br')
    expect(decoded.bytes).toBe(3)
  })

  it('não finge texto para zstd', async () => {
    const decoded = await decodeBody(
      response({
        encoding: 'base64',
        body: base64(new Uint8Array([0x28, 0xb5, 0x2f, 0xfd])),
        headers: [{ name: 'content-encoding', value: 'zstd' }],
      }),
    )

    expect(decoded.kind).toBe('opaque')
  })

  it('não finge texto para bytes que não são utf-8', async () => {
    // Uma imagem. Decodificar isso com o decodificador tolerante encheria a
    // tela de U+FFFD dizendo que é o corpo — que é exatamente o defeito que o
    // servidor corrigiu do lado dele.
    const decoded = await decodeBody(
      response({ encoding: 'base64', body: base64(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])) }),
    )

    expect(decoded.kind).toBe('opaque')
  })

  it('não finge texto quando o gzip está quebrado', async () => {
    const decoded = await decodeBody(
      response({
        encoding: 'base64',
        body: base64(new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00])),
        headers: [{ name: 'content-encoding', value: 'gzip' }],
      }),
    )

    expect(decoded.kind).toBe('opaque')
  })

  it('para de expandir no teto em vez de derrubar a janela', async () => {
    // 5 MB de gzip viram gigabytes descomprimidos. O teto do servidor limita o
    // que **chega**; sem um teto aqui, o que chega vira o que o renderer tem
    // que segurar em memória, e ele não tem.
    const bytes = await compress('a'.repeat(2_000_000), 'gzip')
    expect(bytes.length).toBeLessThan(10_000)

    const decoded = await decodeBody(
      response({
        encoding: 'base64',
        body: base64(bytes),
        headers: [{ name: 'content-encoding', value: 'gzip' }],
      }),
      1024,
    )

    expect(decoded.kind).toBe('text')
    if (decoded.kind !== 'text') throw new Error('esperava texto')
    expect(decoded.truncated).toBe(true)
    expect(decoded.text.length).toBeLessThanOrEqual(1024)
    expect(decoded.text.startsWith('aaaa')).toBe(true)
  })

  it('um corpo que cabe exatamente no teto não é marcado truncado', async () => {
    // A marca é o que a pessoa lê para saber se falta alguma coisa. Um `>=` no
    // lugar do `>` a faz mentir no caso da borda — e foi exatamente isso que
    // aconteceu uma vez do lado do servidor.
    const bytes = await compress('a'.repeat(1024), 'gzip')
    const decoded = await decodeBody(
      response({
        encoding: 'base64',
        body: base64(bytes),
        headers: [{ name: 'content-encoding', value: 'gzip' }],
      }),
      1024,
    )

    expect(decoded).toEqual({ kind: 'text', text: 'a'.repeat(1024), truncated: false, ceiling: false })
  })

  it('não confunde um nome herdado do protótipo com um formato que conhece', () => {
    // `token in FORMATS` anda o protótipo: `content-encoding: constructor`
    // passava pelo guarda do "não sei abrir" e ia para
    // `new DecompressionStream(Object)`, que estoura — e a pessoa lia "não
    // abriu" no lugar de "não sei abrir".
    return expect(
      decodeBody(
        response({
          encoding: 'base64',
          body: base64(new Uint8Array([1, 2, 3])),
          headers: [{ name: 'content-encoding', value: 'constructor' }],
        }),
      ),
      // A recusa tem que ser a **certa**. Com `in`, esta chamada já devolvia
      // `opaque` — pelo outro ramo, dizendo "não abriu" sobre um formato que
      // nunca existiu. Passar pelo motivo errado é o que esta asserção pega.
    ).resolves.toMatchObject({ kind: 'opaque', reason: expect.stringContaining('não sabe abrir') })
  })

  it('trata `identity` como ausência de compressão', async () => {
    const decoded = await decodeBody(
      response({
        encoding: 'base64',
        body: base64(new TextEncoder().encode('oi')),
        headers: [{ name: 'content-encoding', value: 'identity' }],
      }),
    )

    expect(decoded).toEqual({ kind: 'text', text: 'oi', truncated: false, ceiling: false })
  })

  it('desfaz uma cadeia de codificações na ordem inversa', async () => {
    // `content-encoding: gzip, deflate` diz que gzip foi aplicado **primeiro**.
    // Desfazer na ordem lida devolve lixo, e lixo que não é utf-8 vira
    // "não é texto" — uma recusa certa pela razão errada.
    const once = await compress('{"ok":true}', 'gzip')
    const twice = await compressBytes(once, 'deflate')

    const decoded = await decodeBody(
      response({
        encoding: 'base64',
        body: base64(twice),
        headers: [{ name: 'content-encoding', value: 'gzip, deflate' }],
      }),
    )

    expect(decoded).toEqual({ kind: 'text', text: '{"ok":true}', truncated: false, ceiling: false })
  })

  it('recusa uma sequência utf-8 pendente no fim de um corpo completo', async () => {
    // O flush final só roda quando **não** truncamos, e é ele que denuncia
    // corrupção de verdade. Os outros testes de não-texto estouram no primeiro
    // byte e nunca chegam nele.
    const decoded = await decodeBody(
      response({ encoding: 'base64', body: base64(new Uint8Array([0x61, 0x62, 0xe2, 0x82])) }),
    )

    expect(decoded.kind).toBe('opaque')
  })

  it('corta no meio de um caractere multibyte sem inventar caractere', async () => {
    // 'é' são dois bytes. Cortar entre eles e decodificar com o decodificador
    // tolerante daria U+FFFD no fim do texto — a tela mostrando um caractere
    // que o alvo não mandou.
    const bytes = await compress('aé', 'gzip')
    const decoded = await decodeBody(
      response({
        encoding: 'base64',
        body: base64(bytes),
        headers: [{ name: 'content-encoding', value: 'gzip' }],
      }),
      2,
    )

    expect(decoded).toEqual({ kind: 'text', text: 'a', truncated: true, ceiling: true })
  })

  it('mostra o prefixo que abriu quando o servidor já disse que cortou', async () => {
    // Um gzip cortado pelo teto de 5 MB do servidor estoura no fim — e isso é
    // esperado, não corrupção: o servidor **avisou**. Jogar fora o prefixo que
    // já tinha aberto é descartar o que a pessoa poderia ler.
    const bytes = await compress('{"items":[1,2,3,4,5,6,7,8,9,10]}'.repeat(40), 'gzip')
    const cut = bytes.subarray(0, Math.floor(bytes.length * 0.8))

    const decoded = await decodeBody(
      response({
        encoding: 'base64',
        body: base64(cut),
        truncated: true,
        headers: [{ name: 'content-encoding', value: 'gzip' }],
      }),
    )

    expect(decoded.kind).toBe('text')
    if (decoded.kind !== 'text') throw new Error('esperava texto')
    expect(decoded.truncated).toBe(true)
    // Cortado, sim — mas não por esta tela. Quem cortou foi a rede, e a marca
    // do teto de 16 MB sobre um corpo de 1 KB seria uma causa inventada.
    expect(decoded.ceiling).toBe(false)
    expect(decoded.text.startsWith('{"items"')).toBe(true)
  })

  it('continua recusando um gzip quebrado que o servidor disse estar inteiro', async () => {
    // A contrapartida do teste acima: sem o aviso do servidor, um gzip que não
    // abre é corrupção, e mostrar o prefixo seria apresentar como resposta
    // meia resposta que ninguém marcou.
    const bytes = await compress('{"items":[1,2,3]}'.repeat(40), 'gzip')
    const cut = bytes.subarray(0, Math.floor(bytes.length * 0.8))

    const decoded = await decodeBody(
      response({
        encoding: 'base64',
        body: base64(cut),
        truncated: false,
        headers: [{ name: 'content-encoding', value: 'gzip' }],
      }),
    )

    expect(decoded.kind).toBe('opaque')
  })

  it('um prefixo salvo por prazo estourado não é creditado ao teto desta tela', async () => {
    // `timedOut` corta na rede, igual ao `truncated` — e é o ramo que ninguém
    // exercitava: apagar `|| response.timedOut` deixava a suíte inteira verde.
    const bytes = await compress('{"items":[1,2,3]}'.repeat(40), 'gzip')
    const cut = bytes.subarray(0, Math.floor(bytes.length * 0.8))

    const decoded = await decodeBody(
      response({
        encoding: 'base64',
        body: base64(cut),
        truncated: false,
        timedOut: true,
        headers: [{ name: 'content-encoding', value: 'gzip' }],
      }),
    )

    expect(decoded).toMatchObject({ kind: 'text', truncated: true, ceiling: false })
  })

  it('o teto desta tela, e só ele, liga a marca do teto', async () => {
    const bytes = await compress('a'.repeat(5_000), 'gzip')
    const decoded = await decodeBody(
      response({
        encoding: 'base64',
        body: base64(bytes),
        headers: [{ name: 'content-encoding', value: 'gzip' }],
      }),
      64,
    )

    expect(decoded).toMatchObject({ kind: 'text', truncated: true, ceiling: true })
  })
})