import type { HttpWire } from '@dailly/requests-core/http'
import { request as undiciRequest } from 'undici'

/**
 * O teto da resposta, e por que existe um.
 *
 * 5 MB é grande para qualquer JSON de API e pequeno para não travar a janela
 * que vai desenhar isso. Passar disso **trunca e marca** — nunca descarta em
 * silêncio, e nunca entrega inteiro fingindo que o tamanho não importa.
 */
export const RESPONSE_CAP_BYTES = 5 * 1024 * 1024

/** Trinta segundos: acima disso a pessoa já desistiu, e o processo não deve segurar o socket. */
const TIMEOUT_MS = 30_000

export interface ExecutedResponse {
  readonly status: number
  readonly headers: readonly { name: string; value: string }[]
  readonly body: string
  /** `base64` quando o corpo não é texto — a marca é o que evita corpo corrompido. */
  readonly encoding: 'utf-8' | 'base64'
  readonly truncated: boolean
  readonly bytes: number
  readonly durationMs: number
}

export class TargetUnreachableError extends Error {
  override readonly name = 'TargetUnreachableError'
  constructor(url: string, cause: string) {
    super(`não consegui alcançar ${url}: ${cause}`)
  }
}

/** Content-types cujo corpo é texto de verdade; o resto vira base64. */
const TEXTUAL = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded)|.*\+json|.*\+xml)/i

/**
 * Manda a requisição de verdade — o lado efeito do driver.
 *
 * Aqui e não no renderer, e a [ADR 0011](../../../../docs/adrs/0011-requests-modulo-e-execucao.md)
 * diz por quê: um browser não deixa definir `Host`, `Origin` nem `Cookie`, a
 * resposta volta opaca por CORS a partir de `file://`, e gRPC não existe num
 * webview. `undici.request` dá o que falta — header arbitrário, redirect **não
 * seguido**, e o tempo medido aqui, que é mais honesto que medir no renderer
 * porque exclui o agendamento da janela.
 *
 * Redirect não é seguido, e isso é o **padrão** do `undici.request` — não uma
 * opção que eu ligo. Escrevo aqui porque é uma propriedade de que este código
 * depende: um cliente de API existe para mostrar o 302 e o `Location`, não
 * para escondê-los. Se um dia a biblioteca mudar de padrão, é este parágrafo
 * que diz o que quebrou.
 */
export async function executeHttp(wire: HttpWire): Promise<ExecutedResponse> {
  const started = Date.now()

  let response: Awaited<ReturnType<typeof undiciRequest>>
  try {
    response = await undiciRequest(wire.url, {
      method: wire.method as 'GET',
      headers: Object.fromEntries(wire.headers.map((header) => [header.name, header.value])),
      ...(wire.body === null ? {} : { body: wire.body }),
      headersTimeout: TIMEOUT_MS,
      bodyTimeout: TIMEOUT_MS,
    })
  } catch (cause) {
    // DNS que não resolve, conexão recusada, TLS inválido: é falha do alvo, não
    // deste servidor. Um 500 mandaria quem chama procurar o defeito aqui.
    throw new TargetUnreachableError(wire.url, cause instanceof Error ? cause.message : 'falhou')
  }

  const chunks: Buffer[] = []
  let bytes = 0
  let truncated = false
  for await (const chunk of response.body) {
    const piece = Buffer.from(chunk)
    bytes += piece.length
    if (!truncated) {
      const room = RESPONSE_CAP_BYTES - chunks.reduce((total, c) => total + c.length, 0)
      if (piece.length >= room) {
        chunks.push(piece.subarray(0, room))
        truncated = true
      } else {
        chunks.push(piece)
      }
    }
  }

  const contentType = String(response.headers['content-type'] ?? '')
  const buffer = Buffer.concat(chunks)
  const textual = TEXTUAL.test(contentType)

  return {
    status: response.statusCode,
    headers: Object.entries(response.headers).flatMap(([name, value]) =>
      value === undefined
        ? []
        : (Array.isArray(value) ? value : [value]).map((item) => ({ name, value: String(item) })),
    ),
    body: textual ? buffer.toString('utf-8') : buffer.toString('base64'),
    encoding: textual ? 'utf-8' : 'base64',
    truncated,
    bytes,
    durationMs: Date.now() - started,
  }
}
