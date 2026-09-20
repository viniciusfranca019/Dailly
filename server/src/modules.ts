import { entriesModule } from './modules/entries/index.js'
import type { ServerModule } from './shell/module.js'

/**
 * O manifest — o único lugar que sabe quais módulos existem no servidor.
 *
 * O shell lê daqui e monta o que estiver na lista; ele não importa módulo
 * nenhum pelo nome, e o `architecture.test.ts` é quem garante isso.
 *
 * **Sem flag de build, ao contrário da `ui/`.** Lá a flag existe para *remover*
 * código de um bundle que o usuário baixa. Aqui não há bundle: uma rota
 * desligada não custa nada a ninguém, e uma flag de runtime no servidor abriria
 * a única divergência que interessa evitar — um renderer sem o módulo falando
 * com uma API que o tem, ou o contrário.
 */
export const MODULES: readonly ServerModule[] = [entriesModule]
