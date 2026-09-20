/** Um header, como par — lista e não mapa, porque `-H` repetido é legítimo. */
export interface HttpHeader {
  readonly name: string
  readonly value: string
}

/**
 * A credencial do `-u`, guardada em claro e não como `Authorization` pronto.
 *
 * Materializar o `Basic` na importação satisfaria a letra do C1 e furaria o
 * C4: a credencial já estaria em base64 quando o `resolve()` rodasse, e um
 * `{{user}}` dentro dela deixaria de ser variável para virar um punhado de
 * bytes — a requisição sairia com credencial falsa e ninguém veria, porque
 * está codificada. Aqui ela passa pela interpolação como todo o resto, e o
 * `toWire` fecha o base64 no fim.
 *
 * Efeito colateral que é ganho: uma UI consegue mostrar e editar usuário e
 * senha, em vez de um blob opaco onde a pessoa digitou a senha dela.
 */
export interface HttpAuth {
  readonly user: string
  readonly password: string
}

/** O schema do protocolo HTTP. Só ele conhece estes campos. */
export interface HttpSpec {
  readonly method: string
  readonly url: string
  readonly headers: readonly HttpHeader[]
  readonly body: string | null
  readonly auth: HttpAuth | null
}
