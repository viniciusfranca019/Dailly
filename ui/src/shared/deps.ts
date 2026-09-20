import type { Entry, EntryFilter, ISODateTime, NewEntry } from '@dailly/domain'
import type { TimeZone } from '@dailly/periods'
import type { RequestsPort } from './requests.js'

/**
 * What the composition root hands a module.
 *
 * Use-cases, never a repository: ADR 0001 says the UI depends only on
 * use-cases and ports, and a screen that could see the repository would
 * eventually reach past them. The module cannot tell whether the store is
 * SQLite across a socket or a fake in a test, which is the point.
 *
 * `zone` rides along because ADR 0007 requires the UI to **always** show which
 * zone is in use — it is not a Settings detail, it is on screen.
 */
export interface ModuleDeps {
  createEntry(input: NewEntry): Promise<Entry>
  queryEntries(filter?: EntryFilter): Promise<Entry[]>
  readonly zone: TimeZone
  /**
   * The current instant, from the composition root rather than from `Date`.
   *
   * A screen that says "Hoje" has to know what today is, and a screen that
   * reads the clock itself cannot be tested on any day but the one the test
   * runs. Same reason `createEntry` takes a `Clock`.
   */
  now(): ISODateTime
  /**
   * A coleção de requests e o executor — e a dívida que este campo é.
   *
   * O Daily Log recebe uma port que nunca chama, e o Requests recebe dois
   * use-cases de Entry que nunca chama. É o mesmo sintoma da Lei 4 que o
   * servidor tinha antes do `provide`: um saco único que cresce a cada módulo,
   * onde acrescentar um caso significa editar algo que já funciona.
   *
   * Está aqui de propósito e por um PR só. **O gatilho da correção já está
   * combinado**: a próxima feature parte este contrato em "o que é de todo
   * módulo" (`zone`, `now`) e "o que é deste módulo", do mesmo jeito que o
   * `ProvideContext` fez do lado do servidor. Até lá, o custo é um campo
   * ignorado e não um mecanismo novo — que seria mais caro de desfazer.
   */
  readonly requests: RequestsPort
}
