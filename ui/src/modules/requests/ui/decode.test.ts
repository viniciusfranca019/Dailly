// @vitest-environment jsdom
import type { ExecutedResponse } from '@shared'
import { describe, expect, it } from 'vitest'
import { decodeBody } from './decode.js'

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

/** O jsdom não tem `Blob.prototype.stream`, então a fonte é um stream à mão. */
const streamOf = (bytes: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })

async function compress(text: string, format: 'gzip' | 'deflate'): Promise<Uint8Array> {
  const source = streamOf(new TextEncoder().encode(text))
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

    expect(decoded).toEqual({ kind: 'text', text: '{"ok":true}', truncated: false })
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
    expect(decoded).toEqual({ kind: 'text', text: '{"ok":true}', truncated: false })
  })

  it('deixa passar o que o servidor já entregou como texto', async () => {
    const decoded = await decodeBody(response({ body: 'oi', encoding: 'utf-8', truncated: true }))

    expect(decoded).toEqual({ kind: 'text', text: 'oi', truncated: true })
  })

  it('lê base64 sem content-encoding quando o conteúdo é texto', async () => {
    const decoded = await decodeBody(
      response({ encoding: 'base64', body: base64(new TextEncoder().encode('olá')) }),
    )

    expect(decoded).toEqual({ kind: 'text', text: 'olá', truncated: false })
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
})
