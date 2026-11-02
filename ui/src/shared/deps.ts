import type { ISODateTime } from '@dailly/domain'
import type { TimeZone } from '@dailly/periods'

/**
 * O que é de **todo** módulo — e só isso.
 *
 * Antes este arquivo era um saco único: o Daily Log recebia a port de Requests
 * que nunca chamava, e o Requests recebia os use-cases de Entry. Era o sintoma
 * da Lei 4 que o servidor curou com o `ProvideContext`. Agora o contrato tem
 * duas metades: esta, comum, e a de cada módulo, que ele declara no próprio
 * `deps.ts` e que a raiz de composição entrega pelo `OwnDeps` do shell.
 *
 * Use-cases, nunca repositório (ADR 0001): o módulo não sabe se o store é
 * SQLite do outro lado de um socket ou um fake de teste.
 */
export interface SharedDeps {
  /**
   * A zona em uso. A ADR 0007 exige que a UI **sempre** a mostre — não é
   * detalhe de Settings, está na tela.
   */
  readonly zone: TimeZone
  /**
   * O instante atual, vindo da raiz e não de `Date`: uma tela que diz "Hoje"
   * lida sozinha com o relógio só pode ser testada no dia em que o teste roda.
   */
  now(): ISODateTime
}
