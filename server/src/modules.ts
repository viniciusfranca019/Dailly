import { entriesModule } from './modules/entries/index.js'
import { requestsModule } from './modules/requests/index.js'
import { type AnyServerModule, defineModule } from './shell/module.js'

/**
 * O manifest — o único lugar que sabe quais módulos existem no servidor.
 *
 * O shell lê daqui e monta o que estiver na lista; ele não importa módulo
 * nenhum pelo nome, e o `architecture.test.ts` é quem garante isso.
 *
 * Sem flag de build, ao contrário da `ui/` — a causa está na ADR 0006,
 * Emenda 2, e fica só lá.
 */
export const MODULES: readonly AnyServerModule[] = [
  // `defineModule` e não anotação direta: ele é a porta que força a checagem
  // pelo tipo de autoria, onde declarar `TOwn` sem `provide` é erro.
  defineModule(entriesModule),
  defineModule(requestsModule),
]
