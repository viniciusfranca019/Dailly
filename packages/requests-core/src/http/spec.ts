/** Um header, como par — lista e não mapa, porque `-H` repetido é legítimo. */
export interface HttpHeader {
  readonly name: string
  readonly value: string
}

/** O schema do protocolo HTTP. Só ele conhece estes campos. */
export interface HttpSpec {
  readonly method: string
  readonly url: string
  readonly headers: readonly HttpHeader[]
  readonly body: string | null
}
