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

/**
 * Expande, parando no teto — e o teto é uma resposta, não uma exceção.
 *
 * Falhar também é resposta: `failed` em vez de `throw` porque o que já abriu
 * pode valer alguma coisa. Um gzip cortado pelo teto de 5 MB do servidor
 * **sempre** estoura no fim, e ali o estouro é esperado, não corrupção — o
 * servidor avisou que cortou.
 */
async function inflate(
  bytes: Uint8Array,
  formats: readonly CompressionFormat[],
  limit: number,
): Promise<{ chunks: Uint8Array[]; truncated: boolean; failed: boolean }> {
  // `content-encoding: a, b` diz que `a` foi aplicado primeiro, então desfaz-se
  // de trás para frente.
  // Um `ReadableStream` montado à mão, e não `new Blob([bytes]).stream()`:
  // `Blob` existe em toda parte, `Blob.prototype.stream` não — o jsdom que
  // roda estes testes não o tem. Depender dele faria o caminho mais importante
  // deste arquivo ser o único impossível de testar.
  //
  // O tipo é `BufferSource` e não `Uint8Array` porque é assim que a lib DOM
  // declara o lado de escrita do `DecompressionStream`; encadear com o tipo
  // estreito só passaria com um cast, e um cast aqui esconderia o dia em que
  // a forma de verdade mudar.
  let source: ReadableStream<BufferSource> = new ReadableStream<BufferSource>({
    start(controller) {
      // `new Uint8Array(bytes)` e não `bytes`: a cópia troca o buffer por um
      // `ArrayBuffer` concreto, que é o que `BufferSource` exige. Um cast aqui
      // passaria igual e esconderia o dia em que a forma mudar.
      controller.enqueue(new Uint8Array(bytes))
      controller.close()
    },
  })
  let inflated: ReadableStream<Uint8Array> | null = null
  for (const format of [...formats].reverse()) {
    const piped = source.pipeThrough(new DecompressionStream(format))
    source = piped
    inflated = piped
  }
  // Só chega aqui com pelo menos um formato; sem nenhum não há o que expandir.
  if (inflated === null) return { chunks: [bytes], truncated: false, failed: false }

  const reader = inflated.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return { chunks, truncated: false, failed: false }

      const room = limit - total
      // `>` e não `>=`: um corpo que cabe **exatamente** no teto está inteiro,
      // e marcá-lo truncado é a marca mentindo. O mesmo `>=` já fez isso uma
      // vez do lado do servidor.
      if (value.byteLength > room) {
        chunks.push(value.subarray(0, room))
        await reader.cancel()
        return { chunks, truncated: true, failed: false }
      }

      chunks.push(value)
      total += value.byteLength
    }
  } catch {
    return { chunks, truncated: false, failed: true }
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

  // `Object.hasOwn` e não `in`: `in` anda o protótipo, então
  // `content-encoding: constructor` passava por este guarda e ia parar em
  // `new DecompressionStream(Object)`. A pessoa lia "não abriu" sobre um
  // formato que nunca existiu — a recusa certa pelo motivo errado.
  const unsupported = tokens.find((token) => !Object.hasOwn(FORMATS, token))
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
    const formats: CompressionFormat[] = []
    for (const token of tokens) {
      const format = Object.hasOwn(FORMATS, token) ? FORMATS[token] : undefined
      if (format !== undefined) formats.push(format)
    }

    const inflated = await inflate(bytes, formats, limit)
    truncated = truncated || inflated.truncated

    /**
     * Falhou: o prefixo vale se o servidor já tinha dito que cortou.
     *
     * Um gzip cortado no teto de 5 MB **sempre** estoura no fim, e ali o
     * estouro é esperado. Descartar tudo faria a tela não mostrar nada de uma
     * resposta que chegou pela metade e estava marcada como tal. Sem esse
     * aviso, porém, um gzip que não abre é corrupção, e mostrar meia resposta
     * sem ninguém ter marcado é apresentar como completo o que não é.
     */
    if (inflated.failed) {
      const partialIsExpected = response.truncated || response.timedOut
      if (!partialIsExpected || inflated.chunks.length === 0) {
        return {
          kind: 'opaque',
          reason: 'o corpo diz estar comprimido, mas não abriu',
          encoding: declared,
          bytes: response.bytes || bytes.byteLength,
        }
      }
      truncated = true
    }

    chunks = inflated.chunks
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
