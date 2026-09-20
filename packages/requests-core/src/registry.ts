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
 * Mesma forma do `BlockRegistry` do whiteboard-core, pela mesma razão: um lugar
 * onde acrescentar um caso é **um arquivo novo mais um `register()`**, nunca
 * uma edição no núcleo. Amanhã um driver gRPC entra aqui sem que nada em
 * `protocol.ts`, `resolve.ts` ou `interpolate.ts` saiba que ele existe.
 *
 * Os drivers são guardados alargados, como lá: o registry os trata de forma
 * uniforme enquanto cada um continua estritamente tipado no seu próprio
 * arquivo de declaração.
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
