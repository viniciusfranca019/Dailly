import type { ServerModule } from '../../shell/module.js'
import { ENTRIES_MIGRATIONS } from './migrations.js'
import { registerEntryRoutes } from './routes.js'

/**
 * Entries — superfície pública do módulo no servidor.
 *
 * Tudo que o shell precisa saber passa por aqui, e nada mais: um import do
 * shell para dentro de `modules/entries/**` é violação de fronteira, e o
 * `architecture.test.ts` falha nomeando o arquivo.
 */
export const entriesModule: ServerModule = {
  id: 'entries',
  migrations: ENTRIES_MIGRATIONS,
  register: registerEntryRoutes,
}

export { sqliteEntryRepository } from './sqlite-entry-repository.js'
export { validateEntry, validateRange } from './validate.js'
export type { Invalid } from './validate.js'
