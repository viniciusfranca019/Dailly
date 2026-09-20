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
  /**
   * `null` quando o comando não trouxe dois-pontos fora de uma chave.
   *
   * `-u '{{cred}}'` é o caso: cortar ali daria usuário `{{cred}}` e senha
   * vazia, e a fita levaria `u:p:`. Sem corte, a credencial inteira atravessa
   * a interpolação e o `:` de verdade aparece do outro lado.
   */
  readonly password: string | null
}

/** O schema do protocolo HTTP. Só ele conhece estes campos. */
export interface HttpSpec {
  readonly method: string
  readonly url: string
  readonly headers: readonly HttpHeader[]
  readonly body: string | null
  /**
   * Os pares que o `-G` mandou para a query, **ainda não colados na URL**.
   *
   * Colar na importação exigiria escolher entre `?` e `&` olhando o texto
   * literal da URL — e a URL pode ser uma chave. `{{baseUrl}}` não tem `?`, o
   * importador escolheria `?`, e depois da interpolação sairia
   * `https://x.dev/a?j=1?q=1`. É o mesmo defeito do `-u` em base64 e do
   * `--data-urlencode` em percent-encoding, no terceiro disfarce.
   *
   * Depois da interpolação a URL é literal de verdade, e aí a escolha é
   * trivial. Por isso a junção mora no `toWire`.
   */
  readonly query: readonly string[]
  readonly auth: HttpAuth | null
}
