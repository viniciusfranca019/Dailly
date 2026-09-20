/**
 * O envelope, e o contrato que o torna extensível.
 *
 * `ProtocolSpec` é genérico sobre o payload porque **cada protocolo tem o seu
 * schema**: HTTP tem método, URL, headers e corpo; gRPC terá serviço, método e
 * mensagem; AMQP terá exchange e routing key. O envelope só conhece o que é
 * comum aos três — identidade, nome e qual protocolo é.
 *
 * A alternativa, um spec com cara de HTTP e `protocol` como etiqueta, é mais
 * fácil de tipar hoje e morre no dia do gRPC, que não tem URL nem header
 * nenhum ([ADR 0011](../../../docs/adrs/0011-requests-modulo-e-execucao.md)).
 */
export interface ProtocolSpec<T = unknown> {
  readonly id: string
  readonly name: string
  readonly protocol: string
  readonly spec: T
}

export interface Invalid {
  readonly field: string
  readonly message: string
}

/**
 * O que o importador não aplicou, e por que isso é devolvido em vez de calado.
 *
 * Colar do DevTools traz `--compressed` em praticamente todo curl, então
 * recusar o desconhecido tornaria a função inútil no caso mais comum. Ignorar
 * em silêncio é o que Postman e Insomnia fazem, e é o que faz alguém colar um
 * `--cert` achando que ele foi aplicado. A terceira saída é esta: passa, e diz
 * o que deixou de fora.
 */
export interface Imported<T> {
  readonly spec: T
  readonly ignored: readonly string[]
}

/**
 * A metade **pura** do driver — a que roda nos dois runtimes.
 *
 * Executar não está aqui de propósito: `execute` mora no servidor, porque um
 * renderer não consegue mandar `Host`, `Origin` nem `Cookie`, e porque gRPC não
 * existe num webview (ADR 0011). O que esta metade faz é entender, validar e
 * dizer o que sairia na fita.
 *
 * A forma espelha o `BlockDefinition` do whiteboard-core — objeto literal com
 * um punhado de funções, registrado num registry — porque é o idioma que este
 * repositório já usa para o mesmo problema: um ponto de extensão onde
 * acrescentar um caso é um arquivo novo, não uma edição no núcleo.
 */
/** O mínimo que toda requisição na fita tem: de qual protocolo ela é. */
export interface WireRequest {
  readonly protocol: string
}

export interface ProtocolDriver<T, W extends WireRequest = WireRequest> {
  readonly protocol: string
  /** Estreita `unknown` para o schema deste protocolo, ou diz o que está errado. */
  validate(spec: unknown): { spec: T } | { errors: Invalid[] }
  /**
   * A requisição literal que sairia deste spec — o preview.
   *
   * Recebe o spec **já interpolado**: trocar `{{variável}}` por valor é
   * genérico e mora no `resolve`, porque senão cada driver novo reimplementaria
   * a mesma substituição, cada um com um bug diferente.
   */
  toWire(spec: T): W
  /**
   * A forma crua deste protocolo — `curl` no HTTP. Opcional: nem todo
   * protocolo tem texto que alguém cola.
   */
  fromRaw?(raw: string): Imported<T>
}
