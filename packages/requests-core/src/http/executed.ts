/**
 * O envelope que `POST /requests/:id/execute` devolve — o contrato da fita.
 *
 * Mora no pacote porque tem dois lados: o `server/` o monta e a `ui/` o lê, e
 * nenhum dos dois importa o outro. Antes ele existia uma vez em cada lado, e a
 * única coisa que os mantinha iguais era o adapter da `ui/` validar campo a
 * campo. A validação continua — a borda ainda não confia na rede —, mas agora
 * as duas pontas compilam contra a mesma declaração, e uma divergência deixa
 * de ser possível de escrever em vez de só ser recusada em execução.
 */
export interface ResponseHeader {
  readonly name: string
  readonly value: string
}

export interface ExecutedResponse {
  readonly status: number
  readonly headers: readonly ResponseHeader[]
  readonly body: string
  /** `base64` quando o corpo não é texto — ou quando veio comprimido. */
  readonly encoding: 'utf-8' | 'base64'
  readonly truncated: boolean
  /**
   * O prazo estourou **durante o corpo**, e o que veio antes está aqui.
   *
   * Devolver o parcial com a marca é mais útil que descartá-lo, e é o mesmo
   * vocabulário que o `truncated` já usa: paramos cedo, e está dito por quê.
   * No aperto de mão nada disso existe — lá não há parcial a devolver, e a
   * recusa é erro.
   */
  readonly timedOut: boolean
  /**
   * Bytes efetivamente recebidos.
   *
   * Quando `truncated`, a leitura é **interrompida** no teto — então este
   * número é o que chegou, não o que existia.
   */
  readonly bytes: number
  /** O tamanho que o alvo declarou, quando declarou — é ele que diz o que se perdeu. */
  readonly contentLength: number | null
  readonly durationMs: number
}
