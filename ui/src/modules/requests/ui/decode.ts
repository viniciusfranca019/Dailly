import type { ExecutedResponse } from '@shared'

/**
 * O corpo, pronto para a tela — ou a recusa honesta de fingir que é texto.
 *
 * As duas formas existem porque a alternativa é a que o gate do B2a pegou do
 * lado do servidor: decodificar bytes comprimidos como utf-8 produz uma parede
 * de U+FFFD com três marcas dizendo "texto completo". Errar em silêncio sobre
 * o que o alvo respondeu é pior do que não mostrar.
 */
export type DecodedBody =
  | { readonly kind: 'text'; readonly text: string; readonly truncated: boolean }
  | {
      readonly kind: 'opaque'
      readonly reason: string
      /** O `content-encoding` que veio, quando foi ele o motivo. */
      readonly encoding: string | null
      readonly bytes: number
    }

/**
 * O teto da expansão, e por que ele não é o teto do servidor.
 *
 * O servidor corta em 5 MB o que **chega pela rede**; comprimido, isso são
 * gigabytes depois de expandir. Sem um teto deste lado, o número que o
 * servidor limitou vira o que o renderer precisa segurar em memória — e uma
 * aba que morre não mostra resposta nenhuma.
 */
export const MAX_DECOMPRESSED_BYTES = 16 * 1024 * 1024

/**
 * O que `DecompressionStream` sabe abrir. **Brotli não está aqui, e não é
 * esquecimento**: nenhum navegador expõe `br` por essa API, e o copy-as-cURL
 * do Firefox manda `Accept-Encoding: gzip, deflate, br` — então `br` chega, e
 * chega dito, não fingido.
 */
const FORMATS: Readonly<Record<string, CompressionFormat>> = {
  gzip: 'gzip',
  'x-gzip': 'gzip',
  deflate: 'deflate',
}

const headerValue = (response: ExecutedResponse, name: string): string | null =>
  response.headers.find((header) => header.name.toLowerCase() === name)?.value ?? null

const fromBase64 = (value: string): Uint8Array =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0))

/**
 * Bytes → texto, recusando o que não é utf-8 em vez de substituir.
 *
 * Em modo streaming o decodificador segura uma sequência incompleta no fim de
 * um pedaço em vez de estragá-la — que é exatamente o que acontece quando a
 * expansão para no teto no meio de um caractere. Por isso o flush final só
 * roda quando **não** truncamos: aí uma sequência pendente é corrupção de
 * verdade, e `fatal` a denuncia.
 */
function toText(chunks: readonly Uint8Array[], truncated: boolean): string {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let text = ''
  for (const chunk of chunks) text += decoder.decode(chunk, { stream: true })
  if (!truncated) text += decoder.decode()
  return text
}

/** Expande, parando no teto — e o teto é uma resposta, não uma exceção. */
async function inflate(
  bytes: Uint8Array,
  formats: readonly CompressionFormat[],
  limit: number,
): Promise<{ chunks: Uint8Array[]; truncated: boolean }> {
  // `content-encoding: a, b` diz que `a` foi aplicado primeiro, então desfaz-se
  // de trás para frente.
  // Um `ReadableStream` montado à mão, e não `new Blob([bytes]).stream()`:
  // `Blob` existe em toda parte, `Blob.prototype.stream` não — o jsdom que
  // roda estes testes não o tem. Depender dele faria o caminho mais importante
  // deste arquivo ser o único impossível de testar.
  let stream: ReadableStream<Uint8Array> = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  for (const format of [...formats].reverse()) {
    stream = stream.pipeThrough(new DecompressionStream(format))
  }

  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return { chunks, truncated: false }

      const room = limit - total
      if (value.byteLength >= room) {
        chunks.push(value.subarray(0, room))
        await reader.cancel()
        return { chunks, truncated: true }
      }

      chunks.push(value)
      total += value.byteLength
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * O envelope do servidor vira o que a tela mostra.
 *
 * Fora do componente porque é a única parte disto com regra, e regra dentro de
 * um `.vue` só se testa montando um DOM.
 */
export async function decodeBody(
  response: ExecutedResponse,
  limit: number = MAX_DECOMPRESSED_BYTES,
): Promise<DecodedBody> {
  if (response.encoding === 'utf-8') {
    return { kind: 'text', text: response.body, truncated: response.truncated }
  }

  const bytes = fromBase64(response.body)
  const declared = headerValue(response, 'content-encoding')
  const tokens = (declared ?? '')
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token !== '' && token !== 'identity')

  const unsupported = tokens.find((token) => !(token in FORMATS))
  if (unsupported !== undefined) {
    return {
      kind: 'opaque',
      reason: `o alvo respondeu comprimido em "${unsupported}", que esta tela não sabe abrir`,
      encoding: unsupported,
      bytes: response.bytes || bytes.byteLength,
    }
  }

  let chunks: Uint8Array[]
  let truncated = response.truncated
  if (tokens.length === 0) {
    chunks = [bytes]
  } else {
    try {
      const inflated = await inflate(
        bytes,
        tokens.map((token) => FORMATS[token]!),
        limit,
      )
      chunks = inflated.chunks
      truncated = truncated || inflated.truncated
    } catch {
      return {
        kind: 'opaque',
        // Corpo truncado pelo teto do servidor chega aqui como gzip cortado, e
        // esta é a frase honesta para ele também.
        reason: 'o corpo diz estar comprimido, mas não abriu',
        encoding: declared,
        bytes: response.bytes || bytes.byteLength,
      }
    }
  }

  try {
    return { kind: 'text', text: toText(chunks, truncated), truncated }
  } catch {
    return {
      kind: 'opaque',
      reason: 'o corpo não é texto — mostrar como texto seria inventar caractere',
      encoding: declared,
      bytes: response.bytes || bytes.byteLength,
    }
  }
}
