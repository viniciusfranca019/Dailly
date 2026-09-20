import { entriesModule } from './modules/entries/index.js'
import type { ServerModule } from './shell/module.js'

/**
 * O manifest — o único lugar que sabe quais módulos existem no servidor.
 *
 * O shell lê daqui e monta o que estiver na lista; ele não importa módulo
 * nenhum pelo nome, e o `architecture.test.ts` é quem garante isso.
 *
 * Sem flag de build, ao contrário da `ui/` — a causa está na ADR 0006,
 * Emenda 2, e fica só lá.
 */
export const MODULES: readonly ServerModule[] = [entriesModule]
