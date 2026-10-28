import type { ProtocolDriver, WireRequest } from '@dailly/requests-core'
import { type HttpSpec, type HttpWire, httpDriver } from '@dailly/requests-core/http'
import { executeHttp } from './execute.js'

/**
 * Um protocolo inteiro, como a ADR 0011 o partiu: a metade pura e a efetiva.
 *
 * As duas andam **juntas num objeto só** de propósito. Registrar o driver num
 * lugar e o executor noutro deixaria existir um protocolo que o servidor sabe
 * montar e não sabe executar — um estado que nenhuma tela explica. Num objeto
 * só, um protocolo sem executor não compila.
 *
 * É um Strategy escolhido por chave, e não precisa de Factory: montar a lista
 * não tem escolha nenhuma, é uma linha na composição do módulo. gRPC ou AMQP
 * entram como mais um `Protocol` nessa lista; as rotas não mudam.
 *
 * O executor devolve `unknown` porque a resposta de cada protocolo tem a sua
 * forma — a do HTTP tem status e headers, uma mensagem AMQP não tem nenhum dos
 * dois. A rota só a serializa.
 */
export interface Protocol<T = unknown, W extends WireRequest = WireRequest> {
  readonly driver: ProtocolDriver<T, W>
  execute(wire: W): Promise<unknown>
}

export const http: Protocol<HttpSpec, HttpWire> = {
  driver: httpDriver,
  execute: (wire) => executeHttp(wire),
}

/** Os protocolos que este servidor sabe montar e executar — hoje um. */
export const PROTOCOLS: readonly Protocol[] = [http]
