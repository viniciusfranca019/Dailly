import type { HttpWire } from '@dailly/requests-core/http'
import { type Dispatcher, errors, request as undiciRequest } from 'undici'

/**
 * O teto da resposta, e por que existe um.
 *
 * 5 MB é grande para qualquer JSON de API e pequeno para não travar a janela
 * que vai desenhar isso. Passar disso **trunca e marca** — nunca descarta em
 * silêncio, e nunca entrega inteiro fingindo que o tamanho não importa.
 */
export const RESPONSE_CAP_BYTES = 5 * 1024 * 1024

/**
 * Trinta segundos, e agora é **prazo**, não ociosidade.
 *
 * `headersTimeout` e `bodyTimeout` do undici medem o intervalo entre pedaços:
 * um alvo que goteja um byte a cada 25 segundos não dispara nenhum dos dois, e
 * a chamada fica pendurada para sempre. O `AbortSignal.timeout` é o relógio de
 * parede que o comentário anterior prometia e o código não cumpria.
 */
const TIMEOUT_MS = 30_000

export interface ExecutedResponse {
  readonly status: number
  readonly headers: readonly { name: string; value: string }[]
  readonly body: string
  /** `base64` quando o corpo não é texto — a marca é o que evita corpo corrompido. */
  readonly encoding: 'utf-8' | 'base64'
  readonly truncated: boolean
  /**
   * Bytes efetivamente recebidos.
   *
   * Quando `truncated`, a leitura é **interrompida** no teto — então este
   * número é o que chegou, não o que existia. Antes ele era o total verdadeiro,
   * e o preço disso era baixar 2 GB para calcular um número.
   */
  readonly bytes: number
  /** O tamanho que o alvo declarou, quando declarou — é ele que diz o que se perdeu. */
  readonly contentLength: number | null
  readonly durationMs: number
}

/**
 * O undici recusou os argumentos — antes de abrir socket nenhum.
 *
 * Método inválido, protocolo de URL que não é http(s), header com caractere
 * proibido: são recusas **do cliente**, e chamá-las de "não consegui alcançar"
 * manda a pessoa investigar a rede por um erro que está no spec dela.
 */
export class InvalidWireError extends Error {
  override readonly name = 'InvalidWireError'
  constructor(cause: string) {
    super(`a requisição montada não é válida: ${cause}`)
  }
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
  // `performance.now()` e não `Date.now()`: um ajuste de relógio no meio da
  // requisição daria duração errada — ou negativa — num campo cujo trabalho
  // inteiro é ser uma medição.
  const started = performance.now()

  let response: Awaited<ReturnType<typeof undiciRequest>>
  try {
    response = await undiciRequest(wire.url, {
      method: wire.method as Dispatcher.HttpMethod,
      headers: Object.fromEntries(wire.headers.map((header) => [header.name, header.value])),
      ...(wire.body === null ? {} : { body: wire.body }),
      headersTimeout: TIMEOUT_MS,
      bodyTimeout: TIMEOUT_MS,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (cause) {
    // A distinção importa mais do que parece: o undici recusa argumento antes
    // de tocar a rede, e tratar isso como "alvo inalcançável" manda a pessoa
    // depurar a conexão por causa de um erro que está no spec dela.
    if (cause instanceof errors.InvalidArgumentError) throw new InvalidWireError(cause.message)
    // DNS que não resolve, conexão recusada, TLS inválido: é falha do alvo, não
    // deste servidor. Um 500 mandaria quem chama procurar o defeito aqui.
    throw new TargetUnreachableError(wire.url, cause instanceof Error ? cause.message : 'falhou')
  }

  const chunks: Buffer[] = []
  let bytes = 0
  let truncated = false

  try {
    for await (const chunk of response.body) {
      const piece = Buffer.from(chunk)
      const room = RESPONSE_CAP_BYTES - bytes

      // `>` e não `>=`: um corpo que termina exatamente no teto está inteiro, e
      // marcá-lo como truncado seria a marca mentindo sobre o que aconteceu.
      if (piece.length > room) {
        chunks.push(piece.subarray(0, room))
        bytes += room
        truncated = true
        break
      }

      chunks.push(piece)
      bytes += piece.length
    }
  } finally {
    // Parar de ler não basta: sem destruir, o socket continua aberto e o alvo
    // continua mandando. O teto tem que limitar a **leitura**, não só a
    // memória — senão um alvo que goteja para sempre segura este processo.
    response.body.destroy()
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
    contentLength: Number.isFinite(Number(response.headers['content-length']))
      ? Number(response.headers['content-length'])
      : null,
    durationMs: Math.round(performance.now() - started),
  }
}
