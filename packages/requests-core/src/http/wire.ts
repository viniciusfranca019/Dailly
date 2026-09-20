import type { WireRequest } from '../protocol.js'
import type { HttpHeader } from './spec.js'

/** O que sai na fita num HTTP — a forma que a UI mostra como "vai ser enviado isto". */
export interface HttpWire extends WireRequest {
  readonly protocol: 'http'
  readonly method: string
  readonly url: string
  readonly headers: readonly HttpHeader[]
  readonly body: string | null
}
