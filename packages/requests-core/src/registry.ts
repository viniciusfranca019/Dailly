import type { ProtocolDriver, WireRequest } from './protocol.js'

export class UnknownProtocolError extends Error {
  override readonly name = 'UnknownProtocolError'
  constructor(protocol: string, known: readonly string[]) {
    super(
      `nenhum driver registrado para o protocolo "${protocol}". ` +
        `Registrados: ${known.length === 0 ? 'nenhum' : known.join(', ')}.`,
    )
  }
}

/**
 * O ponto de extensão do pacote — e é ele que a ADR 0011 promete.
 *
 * Mesmo **propósito** do `BlockRegistry` do whiteboard-core, e o mesmo idioma
 * de armazenamento — os drivers ficam guardados alargados, tratados de forma
 * uniforme, enquanto cada um continua estritamente tipado no seu arquivo de
 * declaração. Acrescentar um caso é um arquivo novo mais um `register()`, e
 * amanhã um driver gRPC entra aqui sem que `protocol.ts`, `resolve.ts` ou
 * `interpolate.ts` saibam que ele existe.
 *
 * **Onde ele diverge, de propósito:**
 *
 * - `get()` lança em vez de devolver `undefined`. Lá a busca é por casamento e
 *   não achar é rotina — o parágrafo cai no parágrafo. Aqui a busca é por
 *   chave exata, e não achar significa que alguém compôs errado: um erro com
 *   nome vale mais que um `undefined` viajando.
 * - Não há `priority`. Lá as definições são **tentadas em ordem** contra uma
 *   linha; aqui a busca é por chave, e não existe ordem para impor.
 * - Não há `clone()`. Lá o parser precisa de um registry por documento; aqui
 *   nada muta um registry depois da composição.
 *
 * As duas últimas seriam violação da Lei 3 se existissem: abstração sem
 * chamador.
 *
 * Registrar o mesmo protocolo duas vezes substitui o driver anterior, como lá.
 */
export class ProtocolRegistry {
  #byProtocol = new Map<string, ProtocolDriver<unknown, WireRequest>>()

  register<T, W extends WireRequest>(driver: ProtocolDriver<T, W>): this {
    this.#byProtocol.set(driver.protocol, driver as unknown as ProtocolDriver<unknown, WireRequest>)
    return this
  }

  get(protocol: string): ProtocolDriver<unknown, WireRequest> {
    const driver = this.#byProtocol.get(protocol)
    if (!driver) throw new UnknownProtocolError(protocol, [...this.#byProtocol.keys()])
    return driver
  }

  protocols(): readonly string[] {
    return [...this.#byProtocol.keys()]
  }
}
