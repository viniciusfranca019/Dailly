import type { Folder, SavedRequest } from '@dailly/requests-core'

/**
 * A port do módulo Requests, escrita nas palavras de quem a consome.
 *
 * Ela **não** é o `RequestStore` do `@dailly/requests-core`, e a diferença é o
 * ponto: o store é a port do servidor, com `requestById` e `moveFolder` que a
 * tela não chama, e sem `execute`, que é a única coisa que a tela não consegue
 * fazer sozinha. Reaproveitar o store aqui faria todo fake de teste
 * implementar sete métodos para exercitar dois — que é exatamente o que
 * `references/architecture.md` diz que acontece quando a port nasce no adapter.
 *
 * Do outro lado dela há HTTP hoje; amanhã, se o renderer virar outra coisa,
 * há outro adapter e nenhuma linha da tela muda.
 */
export interface RequestsPort {
  folders(): Promise<readonly Folder[]>
  requests(): Promise<readonly SavedRequest[]>
  saveFolder(folder: Folder): Promise<Folder>
  saveRequest(request: SavedRequest): Promise<SavedRequest>
  deleteRequest(id: string): Promise<void>
  /**
   * Executa no servidor e devolve o que voltou — nunca guardado.
   *
   * O `env` vai inteiro a cada chamada porque as variáveis são do momento, não
   * da request: a mesma request roda contra `staging` e contra produção sem
   * virar duas.
   */
  execute(id: string, env: Readonly<Record<string, string>>): Promise<ExecutedResponse>
}

export interface ResponseHeader {
  readonly name: string
  readonly value: string
}

/**
 * O envelope que `POST /requests/:id/execute` devolve.
 *
 * Declarado aqui e **não** importado do servidor porque a `ui/` não importa o
 * `server/` — são dois processos, e o que os une é a fita, não um `import`.
 * O preço é o tipo existir duas vezes; a mitigação é que o adapter o *valida*
 * na borda em vez de castar, então uma divergência entre os dois lados aparece
 * como recusa nomeada e não como `undefined` no meio da tela.
 *
 * Movê-lo para `@dailly/requests-core/http` seria o segundo chamador que a
 * Lei 2 cobra, e é o lugar certo para ele. Fica anotado em vez de feito: é
 * refactor do B2a dentro de um PR de tela, e misturar os dois faz o revisor
 * revisar a coisa errada.
 */
export interface ExecutedResponse {
  readonly status: number
  readonly headers: readonly ResponseHeader[]
  readonly body: string
  /** `base64` quando o corpo não é texto — ou quando veio comprimido. */
  readonly encoding: 'utf-8' | 'base64'
  readonly truncated: boolean
  readonly timedOut: boolean
  /** Bytes recebidos. Quando `truncated`, é o que chegou, não o que existia. */
  readonly bytes: number
  readonly contentLength: number | null
  readonly durationMs: number
}

/**
 * Falta variável — e nada saiu para a rede.
 *
 * Um erro próprio, e não uma mensagem, porque a tela precisa dos **nomes**:
 * dizer "falta variável" manda a pessoa caçar qual entre doze. `surviving` são
 * as que estão preenchidas, e servem para mostrar que o env chegou.
 */
export class MissingVariablesError extends Error {
  override readonly name = 'MissingVariablesError'
  constructor(
    readonly missing: readonly string[],
    readonly surviving: readonly string[],
    message: string,
  ) {
    super(message)
  }
}

/**
 * Os quatro jeitos de uma execução falhar, que são quatro problemas diferentes
 * de quem está olhando:
 *
 * - `offline` — a API local do próprio app não respondeu. O alvo nem foi tentado.
 * - `refused` — o servidor recusou o spec **antes** de abrir socket.
 * - `unreachable` — o alvo não atendeu.
 * - `timeout` — o alvo atendeu e não terminou no prazo.
 *
 * Uma mensagem só mandaria a pessoa depurar o lugar errado em três dos quatro
 * casos, que é o mesmo motivo pelo qual as rotas do servidor separam 502, 504
 * e 422.
 */
export type ExecutionFailure = 'offline' | 'refused' | 'unreachable' | 'timeout'

export class ExecutionFailedError extends Error {
  override readonly name = 'ExecutionFailedError'
  constructor(
    readonly kind: ExecutionFailure,
    message: string,
  ) {
    super(message)
  }
}
